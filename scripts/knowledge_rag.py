import os
import json
import argparse
import sys
from pathlib import Path

def search_docs(query, docs_dir):
    """
    Recherche basique par mots-clés dans les fichiers markdown de docs_dir.
    Simule un RAG sémantique pour la couche Knowledge.
    """
    results = []
    query_lower = query.lower()
    
    docs_path = Path(docs_dir)
    if not docs_path.exists():
        return {"error": f"Le dossier {docs_dir} n'existe pas."}
        
    for root, _, files in os.walk(docs_path):
        for file in files:
            if file.endswith('.md'):
                file_path = Path(root) / file
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                    # Recherche très basique (dans une vraie implémentation, on utiliserait des embeddings)
                    if query_lower in content.lower() or query_lower in file.lower():
                        # Extraire le début du fichier pour le "lazy loading"
                        preview = content[:500] + "..." if len(content) > 500 else content
                        results.append({
                            "concept_file": str(file_path.relative_to(docs_path)),
                            "excerpt": preview
                        })
                except Exception as e:
                    pass
                    
    if not results:
        return {"message": f"Aucun concept trouvé pour '{query}'."}
        
    return {"results": results[:3]} # Limiter aux 3 meilleurs résultats pour préserver le contexte

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GenOS Knowledge RAG Simulator")
    parser.add_argument("--query", required=True, help="Le concept à chercher")
    parser.add_argument("--docs", default="docs/concepts", help="Dossier des concepts")
    
    args = parser.parse_args()
    
    result = search_docs(args.query, args.docs)
    print(json.dumps(result, indent=2, ensure_ascii=False))
