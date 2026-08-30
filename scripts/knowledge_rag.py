import os
import json
import argparse
import sys
from pathlib import Path

def search_docs(query, docs_dir):
    """
    Basic keyword search in the markdown files of docs_dir.
    Simulates a semantic RAG for the Knowledge layer.
    """
    results = []
    query_lower = query.lower()
    
    docs_path = Path(docs_dir)
    if not docs_path.exists():
        return {"error": f"The directory {docs_dir} does not exist."}
        
    for root, _, files in os.walk(docs_path):
        for file in files:
            if file.endswith('.md'):
                file_path = Path(root) / file
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                    # Very basic search (in a real implementation, embeddings would be used)
                    if query_lower in content.lower() or query_lower in file.lower():
                        # Extract the beginning of the file for "lazy loading"
                        preview = content[:500] + "..." if len(content) > 500 else content
                        results.append({
                            "concept_file": str(file_path.relative_to(docs_path)),
                            "excerpt": preview
                        })
                except Exception as e:
                    pass
                    
    if not results:
        return {"message": f"No concept found for '{query}'."}
        
    return {"results": results[:3]} # Limit to the top 3 results to preserve context

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GenOS Knowledge RAG Simulator")
    parser.add_argument("--query", required=True, help="The concept to search for")
    parser.add_argument("--docs", default="docs/concepts", help="Concepts directory")
    
    args = parser.parse_args()
    
    result = search_docs(args.query, args.docs)
    print(json.dumps(result, indent=2, ensure_ascii=False))
