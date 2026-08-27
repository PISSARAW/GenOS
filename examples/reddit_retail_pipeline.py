from genos import Swarm, Agent, DeterministicTask, ObserverAgent

def run_pipeline():
    # 1. Télémétrie (Règle GenOS #7: Toujours inclure un Observer)
    telemetry = ObserverAgent(
        name="PipelineTelemetry",
        stream_target="console",
        level="INFO"
    )
    
    # 2. Scraping probabiliste (Agent LLM)
    scraper = Agent(
        name="SocialScraper",
        role="Pull trending topics from Weibo, Baidu, etc.",
        model="flash"
    )
    
    # 3. Déduplication déterministe (Leçon du Redditeur)
    def deduplicate_trends(trends):
        # Match de phrases déterministe, pas de LLM
        seen = set()
        unique = []
        for t in trends:
            if t['phrase'] not in seen:
                unique.append(t)
                seen.add(t['phrase'])
        return unique

    dedup_task = DeterministicTask(
        name="Deduplicator",
        action=deduplicate_trends
    )

    # 4. Filtrage par règles (Leçon du Redditeur)
    def filter_relevance(trends):
        keywords = ["retail", "delivery", "instant"]
        return [t for t in trends if any(k in t['phrase'] for k in keywords)]
        
    filter_task = DeterministicTask(
        name="RuleFilter",
        action=filter_relevance
    )

    # 5. La voie du calendrier (Indépendant des tendances)
    calendar_task = DeterministicTask(
        name="CalendarEvents",
        action=lambda _: [{"event": "Solar Term", "date": "Today"}]
    )

    # 6. Génération finale (Agent LLM)
    marketer = Agent(
        name="MarketingGenerator",
        role="Generate marketing suggestions from trends and calendar",
        model="pro"
    )

    # 7. Orchestration du Swarm GenOS
    swarm = Swarm(name="InstantRetailMarketing", observer=telemetry)
    swarm.add_nodes([scraper, dedup_task, filter_task, calendar_task, marketer])
    
    # Définition du graphe (Flux hybride)
    swarm.link(scraper, dedup_task)
    swarm.link(dedup_task, filter_task)
    swarm.link(filter_task, marketer)
    swarm.link(calendar_task, marketer) # La 2ème voie du Redditeur

    return swarm.execute()

if __name__ == "__main__":
    run_pipeline()
