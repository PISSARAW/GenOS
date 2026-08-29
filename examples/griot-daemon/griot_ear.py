import subprocess
import sys

try:
    import speech_recognition as sr
except ImportError:
    print("Erreur : La librairie SpeechRecognition n'est pas installée.")
    print("Lancez : pip install SpeechRecognition pyaudio openai-whisper")
    sys.exit(1)

def listen_to_griot():
    r = sr.Recognizer()
    
    # Nous utilisons le microphone par défaut du système
    with sr.Microphone() as source:
        print("Étalonnage du bruit ambiant pour l'oreille de Griot...")
        r.adjust_for_ambient_noise(source, duration=2)
        print("✅ Griot est à l'écoute (Écholocation activée). Parlez !")
        
        while True:
            try:
                # Écoute en continu avec un timeout court
                audio = r.listen(source, timeout=5, phrase_time_limit=15)
                print("Signal détecté, traitement par modèle Whisper local...")
                
                # Respect strict de la Règle 8 : Aucune API Cloud. 
                # On utilise la fonction Whisper en local du module SpeechRecognition
                # (Nécessite openai-whisper et ffmpeg installés localement)
                text = r.recognize_whisper(audio, model="tiny", language="fr")
                
                if text.strip():
                    print(f"\n[Echolocation] Humain : \"{text}\"")
                    
                    # 1. On accuse réception en émettant une stridulation audio via le CLI GenOS
                    subprocess.Popen('node backend/bin/genos biomimicry echolocation --freq 800', shell=True)
                    
                    # 2. On transmet la transcription au cerveau de Griot via l'orchestrateur
                    # Note : on échappe les guillemets pour ne pas casser la ligne de commande bash/powershell
                    safe_text = text.replace('"', '\\"')
                    cmd = f'node backend/bin/genos ask griot --input "{safe_text}" --source "echolocation"'
                    
                    print(f"Transmission au système nerveux central...")
                    subprocess.Popen(cmd, shell=True)
                
            except sr.WaitTimeoutError:
                # Rien n'a été entendu, on continue de boucler
                pass
            except sr.UnknownValueError:
                # L'audio n'a pas pu être compris par le modèle (ex: bruit de fond non humain)
                pass
            except Exception as e:
                print(f"⚠️ Perturbation du réseau : {e}")

if __name__ == "__main__":
    listen_to_griot()
