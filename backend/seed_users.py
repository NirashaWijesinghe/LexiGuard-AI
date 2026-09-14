import os
import sys

# Add backend directory to path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.auth_service import auth_service

def seed_users():
    print("Seeding users into the database...")
    
    # Check if admin already exists
    admin = auth_service.get_user_by_email("admin@gmail.com")
    if not admin:
        print("Creating admin user (admin@gmail.com)...")
        auth_service.register_user("admin@gmail.com", "admin123", role="admin")
    else:
        print("Admin user already exists.")
        
    # Check if nirasha already exists
    nirasha = auth_service.get_user_by_email("nirasha@gmail.com")
    if not nirasha:
        print("Creating standard user (nirasha@gmail.com)...")
        auth_service.register_user("nirasha@gmail.com", "nirasha123", role="user")
    else:
        print("Nirasha user already exists.")
        
    print("User seeding complete!")

if __name__ == "__main__":
    seed_users()
