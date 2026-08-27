from genos import Swarm, Agent, HumanApprovalTask, DeterministicTask, ObserverAgent

def run_pipeline():
    # 1. Télémétrie (Règle GenOS #7: Observer obligatoire)
    telemetry = ObserverAgent(
        name="LocalizationTelemetry",
        stream_target="console",
        level="INFO"
    )
    
    # 2. Création du brouillon
    writer = Agent(
        name="ContentWriter",
        role="Generate the initial draft based on given topics.",
        model="pro"
    )
    
    # 3. Agent d'adaptation culturelle
    # Au lieu d'un prompt monolithique, on dédie un agent spécifique aux idiomes locaux.
    localizer = Agent(
        name="NativeLocalizer",
        role="Rewrite the drafted text to sound 100% natural, using local idioms and native phrasing.",
        model="pro"
    )

    # 4. L'étape de validation humaine (La leçon du Redditeur)
    # GenOS intègre nativement des points d'arrêt (Human-in-the-Loop) dans le graphe.
    approval_task = HumanApprovalTask(
        name="NativeSpeakerCheck",
        instruction="Please review the localized content. You can edit the text if it sounds robotic before approving, or reject it to send back to the localizer."
    )

    # 5. Tâche de publication finale (déterministe, ne s'exécute qu'après approbation)
    def publish_content(approved_data):
        # La publication réelle via API
        return f"Published successfully: {approved_data['content']}"

    publish_task = DeterministicTask(
        name="Publisher",
        action=publish_content
    )

    # Orchestration du Swarm GenOS
    swarm = Swarm(name="MultilingualPublisher", observer=telemetry)
    swarm.add_nodes([writer, localizer, approval_task, publish_task])
    
    # Définition du graphe (Flux avec point d'arrêt humain)
    swarm.link(writer, localizer)
    swarm.link(localizer, approval_task)
    swarm.link(approval_task, publish_task)

    return swarm.execute()

if __name__ == "__main__":
    run_pipeline()
