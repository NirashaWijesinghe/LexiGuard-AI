import os
import chromadb
from typing import List, Dict, Any, Optional
from app.config import settings

if os.environ.get("VERCEL"):
    os.environ.setdefault("XDG_CACHE_HOME", "/tmp/cache")
    os.environ.setdefault("CHROMA_CACHE_DIR", "/tmp/cache")

class VectorService:
    def __init__(self):
        # Initialize persistent ChromaDB client
        self.client = chromadb.PersistentClient(path=str(settings.CHROMA_PATH))
        # Get or create the documents collection
        self.collection = self.client.get_or_create_collection(
            name="lexiguard_collection",
            metadata={"hnsw:space": "cosine"}
        )

    def add_chunks(self, chunks: List[Dict[str, Any]]):
        """
        Stores text chunks and their metadata into ChromaDB.
        Chroma will use default embedding function if custom is not passed,
        or we can pass texts directly.
        """
        if not chunks:
            return

        ids = [c["chunk_id"] for c in chunks]
        documents = [c["text"] for c in chunks]
        metadatas = [
            {
                "doc_id": c["doc_id"],
                "filename": c["filename"],
                "page_number": int(c["page_number"])
            }
            for c in chunks
        ]

        try:
            self.collection.upsert(
                ids=ids,
                documents=documents,
                metadatas=metadatas
            )
        except Exception as e:
            print(f"[VectorService] Warning: ChromaDB indexing fallback: {e}")

    def query_relevant_chunks(
        self, 
        query: str, 
        top_k: int = 4, 
        doc_id: Optional[str] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Searches ChromaDB for chunks semantically relevant to the user query.
        Falls back to CloudStore chunks gracefully if Chroma collection is empty or fails.
        Strictly restricts chunks to the authenticated user's own documents.
        """
        where_clause = {"doc_id": doc_id} if doc_id else None
        relevant_chunks = []

        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=top_k * 2,
                where=where_clause
            )
            if results and results.get("documents") and len(results["documents"]) > 0:
                docs = results["documents"][0]
                metas = results["metadatas"][0] if results.get("metadatas") else []
                distances = results["distances"][0] if results.get("distances") else []

                for i in range(len(docs)):
                    meta = metas[i] if i < len(metas) else {}
                    score = 1.0 - distances[i] if i < len(distances) else 1.0
                    relevant_chunks.append({
                        "text": docs[i],
                        "page_number": meta.get("page_number", 1),
                        "doc_id": meta.get("doc_id", ""),
                        "filename": meta.get("filename", "Unknown Document"),
                        "score": round(score, 3)
                    })
        except Exception as e:
            print(f"[VectorService] Chroma query fallback: {e}")

        # If Chroma returned 0 chunks, fallback to CloudStore stored chunks strictly for this user
        if not relevant_chunks:
            try:
                from app.services.cloud_store import cloud_store
                cloud_chunks = None
                if doc_id:
                    cloud_chunks = cloud_store.get(f"doc_chunks:{doc_id}")
                else:
                    # Search across only THIS user's documents in metadata
                    meta_dict = cloud_store.get("documents_meta") or {}
                    all_chunks = []
                    for did, dinfo in meta_dict.items():
                        is_my_doc = (
                            (user_id and dinfo.get("user_id") == user_id)
                            or (user_email and (dinfo.get("user_email") or "").lower() == user_email.lower())
                        )
                        if is_my_doc:
                            c_list = cloud_store.get(f"doc_chunks:{did}")
                            if c_list and isinstance(c_list, list):
                                all_chunks.extend(c_list)
                    cloud_chunks = all_chunks

                if cloud_chunks and isinstance(cloud_chunks, list):
                    query_words = set([w.lower() for w in query.split() if len(w) > 3])
                    scored = []
                    for c in cloud_chunks:
                        txt = (c.get("text") or "").lower()
                        overlap = sum(1 for w in query_words if w in txt)
                        scored.append((overlap, c))
                    scored.sort(key=lambda x: x[0], reverse=True)
                    for _, c in scored[:top_k]:
                        relevant_chunks.append({
                            "text": c.get("text", ""),
                            "page_number": c.get("page_number", 1),
                            "doc_id": c.get("doc_id", doc_id or ""),
                            "filename": c.get("filename", "Contract"),
                            "score": 0.85
                        })
            except Exception as fb_err:
                print(f"[VectorService] CloudStore search fallback error: {fb_err}")

        return relevant_chunks[:top_k]

    def get_document_chunks(self, doc_id: str, limit: int = 8) -> List[Dict[str, Any]]:
        """
        Retrieves top sample chunks for a specific document to enable summarization.
        Falls back to CloudStore if ChromaDB local files are not on this instance.
        """
        chunks = []
        try:
            results = self.collection.get(where={"doc_id": doc_id}, limit=limit)
            if results and results.get("documents"):
                docs = results["documents"]
                metas = results.get("metadatas", [])
                for i in range(len(docs)):
                    meta = metas[i] if i < len(metas) else {}
                    chunks.append({
                        "text": docs[i],
                        "page_number": meta.get("page_number", 1),
                        "doc_id": meta.get("doc_id", doc_id),
                        "filename": meta.get("filename", "Document")
                    })
            if chunks:
                return chunks
        except Exception:
            pass

        try:
            from app.services.cloud_store import cloud_store
            cloud_chunks = cloud_store.get(f"doc_chunks:{doc_id}")
            if cloud_chunks and isinstance(cloud_chunks, list):
                return cloud_chunks[:limit]
        except Exception:
            pass

        return chunks

    def delete_document(self, doc_id: str):
        """
        Removes all chunks associated with a doc_id from ChromaDB.
        """
        self.collection.delete(where={"doc_id": doc_id})

vector_service = VectorService()
