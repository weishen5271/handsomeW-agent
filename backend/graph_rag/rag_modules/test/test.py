# Example for Python with neo4j driver
import os

from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv()

driver = GraphDatabase.driver(
    os.getenv("NEO4J_URI"),
    auth=(os.getenv("NEO4J_USER"), os.getenv("NEO4J_PASSWORD"))
)

# Try to verify connectivity
try:
    driver.verify_connectivity()
    print("Connected successfully!")
except Exception as e:
    print(f"Connection failed: {e}")
