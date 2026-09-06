import os
import json
import argparse
import sys
import math
import re
import urllib.request
from collections import Counter
from pathlib import Path

def get_tokens(text):
    return [w for w in re.split(r'\W+', text.lower()) if len(w) > 1]

def text_to_bow_vector(text):
    tokens = get_tokens(text)
    if not tokens:
        return {}
    counts = Counter(tokens)
    # Add bigrams with weight
    for i in range(len(tokens) - 1):
        counts[f"{tokens[i]}_{tokens[i+1]}"] = counts.get(f"{tokens[i]}_{tokens[i+1]}", 0) + 1.5
    norm = math.sqrt(sum(v * v for v in counts.values()))
    if norm > 0:
        return {k: v / norm for k, v in counts.items()}
    return counts

def cosine_bow(vec_a, vec_b):
    if not vec_a or not vec_b:
        return 0.0
    dot = 0.0
    for term, val_a in vec_a.items():
        if term in vec_b:
            dot += val_a * vec_b[term]
    return dot

def try_ollama_embed(text, endpoint="http://127.0.0.1:11434/api/embed", model="nomic-embed-text"):
    try:
        data = json.dumps({"model": model, "input": text[:2000]}).encode('utf-8')
        req = urllib.request.Request(endpoint, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            if resp.status == 200:
                payload = json.loads(resp.read().decode('utf-8'))
                vec = payload.get("embeddings", [None])[0]
                if vec:
                    norm = math.sqrt(sum(x * x for x in vec))
                    return [x / norm for x in vec] if norm > 0 else vec
    except Exception:
        pass
    return None

def cosine_dense(a, b):
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))

def search_docs(query, docs_dir):
    alias_map = {
        'memory leak': 'apoptosis',
        'concurrency': 'flocking',
        'crash': 'resilience',
        'garbage collection': 'apoptosis',
        'telemetry': 'observer',
        'network': 'quorum',
    }
    expanded_query = query.lower()
    for k, v in alias_map.items():
        if k in expanded_query:
            expanded_query = f"{expanded_query} {v}"

    docs_path = Path(docs_dir)
    if not docs_path.exists():
        return {"error": f"The directory {docs_dir} does not exist."}

    query_dense = try_ollama_embed(expanded_query)
    query_bow = text_to_bow_vector(expanded_query)

    scored_results = []

    for root, dirs, files in os.walk(docs_path):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'target', '.git', '.gemini')]
        for file in files:
            if file.endswith('.md'):
                file_path = Path(root) / file
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    sim = 0.0
                    if query_dense:
                        doc_dense = try_ollama_embed(content[:2000])
                        if doc_dense:
                            sim = cosine_dense(query_dense, doc_dense)

                    if sim <= 0.0:
                        doc_bow = text_to_bow_vector(content)
                        sim = cosine_bow(query_bow, doc_bow)

                    # Keyword bonus for title / file name matches
                    rel_path = str(file_path.relative_to(docs_path))
                    if any(term in rel_path.lower() for term in get_tokens(query)):
                        sim += 0.2

                    if sim > 0.05:
                        preview = content[:500] + "..." if len(content) > 500 else content
                        scored_results.append({
                            "concept_file": rel_path,
                            "similarity_score": round(sim, 4),
                            "excerpt": preview
                        })
                except Exception:
                    pass

    scored_results.sort(key=lambda x: x["similarity_score"], reverse=True)

    if not scored_results:
        return {"message": f"No concept found for '{query}'."}

    return {"results": scored_results[:3]}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GenOS Knowledge RAG Provider")
    parser.add_argument("--query", required=True, help="The concept to search for")
    parser.add_argument("--docs", default="docs", help="Concepts / Docs directory")

    args = parser.parse_args()

    result = search_docs(args.query, args.docs)
    print(json.dumps(result, indent=2, ensure_ascii=False))
