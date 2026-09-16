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
        doc_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Searches ChromaDB for chunks semantically relevant to the user query.
        """
        where_clause = {"doc_id": doc_id} if doc_id else None

        results = self.collection.query(
            query_texts=[query],
            n_results=top_k,
            where=where_clause
        )

        relevant_chunks = []
        if results and results["documents"] and len(results["documents"]) > 0:
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

        return relevant_chunks

    def get_document_chunks(self, doc_id: str, limit: int = 8) -> List[Dict[str, Any]]:
        """
        Retrieves top sample chunks for a specific document to enable summarization.
        """
        try:
            results = self.collection.get(where={"doc_id": doc_id}, limit=limit)
            chunks = []
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
            return chunks
        except Exception:
            return []

    def delete_document(self, doc_id: str):
        """
        Removes all chunks associated with a doc_id from ChromaDB.
        """
        self.collection.delete(where={"doc_id": doc_id})

vector_service = VectorService()
