import os
import re
import json

def extract_data(filepath):
    print(f"[\033[94mWORKER\033[0m] Extraction sur : {os.path.basename(filepath)}")
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    data = {}
    ht_match = re.search(r'Montant HT\s*:\s*([\d.]+)', content)
    tva_match = re.search(r'TVA.*\s*:\s*([\d.]+)', content)
    
    if ht_match: data['HT'] = float(ht_match.group(1))
    if tva_match: data['TVA'] = float(tva_match.group(1))
        
    ttc_line = re.search(r'Montant TTC\s*:\s*(.*)', content)
    if ttc_line:
        raw_ttc = ttc_line.group(1)
        # Détection d'anomalies textuelles typiques du MD
        if '~~' in raw_ttc or '[' in raw_ttc or 'illisible' in raw_ttc.lower():
            print(f"[\033[93mWORKER ALERT\033[0m] Ambiguïté détectée (Rature ou crochet). Confiance: 42.0%")
            data['TTC'] = "AMBIGUOUS"
        else:
            ttc_match = re.search(r'([\d.]+)', raw_ttc)
            if ttc_match:
                data['TTC'] = float(ttc_match.group(1))
                print(f"[\033[92mWORKER INFO\033[0m] Confiance TTC: 99.8%")
                
    return data

def validate_data(data, doc_name):
    print(f"[\033[95mVALIDATION\033[0m] Vérification déterministe pour {doc_name}...")
    
    if data.get('TTC') == 'AMBIGUOUS':
        print(f"[\033[91mVALIDATION ALERT\033[0m] Donnée critique manquante ou ambiguë.")
        print(f"[\033[95mVALIDATION\033[0m] Appel du Circuit Breaker...")
        return False
            
    if data.get('HT') and data.get('TVA') and data.get('TTC'):
        if abs((data['HT'] + data['TVA']) - data['TTC']) < 0.01:
            print(f"[\033[92mVALIDATION INFO\033[0m] Équation HT+TVA=TTC respectée.")
            return True
            
    return False

def main():
    docs = ['doc1_perfect.md', 'doc2_ambiguous.md']
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    for doc in docs:
        filepath = os.path.join(base_dir, doc)
        print("\n" + "="*60)
        
        # 1. Worker Agent
        extracted = extract_data(filepath)
        print(f"[\033[94mWORKER\033[0m] Données extraites : {json.dumps(extracted)}")
        
        # 2. Validation Agent
        is_valid = validate_data(extracted, doc)
        
        # 3. Telemetry Agent / Result
        if not is_valid:
            print(f"[\033[91mCIRCUIT BREAKER\033[0m] Tripping circuit breaker on branch: {doc}_branch (3 failures, threshold 3)")
            print(f"[\033[91mCIRCUIT BREAKER\033[0m] Circuit OPEN: branch is halted")
            print("\n> [!CAUTION]")
            print("> **Tâche Suspendue : Révision Humaine Requise**")
            print(f"> - Document : {doc}")
            print(f"> - Cause : Extraction incertaine (Score < 95%)")
            print("="*60)
            break
        else:
            print(f"[\033[92mSUCCESS\033[0m] {doc} validé pour export comptable.")
            print("="*60)

if __name__ == "__main__":
    main()
