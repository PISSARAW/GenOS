import sys
import json
import urllib.request
import argparse

def send_context_to_node(context_text, api_url="http://localhost:3000/api/memory/vesicle"):
    payload = json.dumps({"context": context_text}).encode('utf-8')
    req = urllib.request.Request(
        api_url,
        data=payload,
        headers={'Content-Type': 'application/json'}
    )

    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            print("✅ Contexte digere et converti en Vesicule :", result)
    except Exception as e:
        print("❌ Erreur de communication avec le noyau Node.js :", e)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GenOS Context Provider")
    parser.add_argument("--context-file", required=True)
    parser.add_argument("--api", default="http://localhost:3000/api/memory/vesicle")
    args = parser.parse_args()
    
    with open(args.context_file, 'r', encoding='utf-8') as f:
        content = f.read()
        
    print(f"🧠 Transmission de {len(content)} caracteres a Node.js...")
    send_context_to_node(content, args.api)
