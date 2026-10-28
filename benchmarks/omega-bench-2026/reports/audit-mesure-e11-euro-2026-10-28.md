# E11 — audit de la mesure énergétique et monétaire

## Conclusion

L'hôte de campagne est une VM Shadow partagée (Blade Shadow Computer, hyperviseur actif). Aucun compteur d'énergie direct attribuable au processus n'est exposé. La métrique « missions réussies par euro » et le seuil de gain relatif de 15 % ne sont donc pas mesurés dans cette campagne. Les résultats fonctionnels E11 restent rapportés séparément.

## Vérifications de l'hôte

- Windows n'expose aucune instance des classes PowerMeter/EnergyMeter; `Get-Counter` ne retourne aucun ensemble PowerMeter/énergie.
- `Win32_Battery` et le rapport batterie sont vides; aucun périphérique PnP Battery/Energy/Power/Sensor n'est présent.
- La collecte SRUM par `powercfg /srumutil` échoue (`0x1f`, puis `SruUpdateStats failed / status 5`) et ne produit pas de relevé exploitable.
- AMD uProf n'est pas installé. WSL utilise un noyau Microsoft dont les interfaces `/sys/class/powercap` et `/sys/class/hwmon` et l'outil `perf` sont absents.

Le contrat Microsoft Energy Meter Interface expose des mesures provenant d'un compteur matériel fourni par un pilote; la disponibilité de classes WMI ne prouve pas que le matériel ou un canal de mesure existe. Le rail E3 privilégie l'interface EMI lorsqu'un rail matériel compatible est présent ([Energy Meter Interface](https://learn.microsoft.com/en-us/windows-hardware/drivers/powermeter/energy-meter-interface), [noms de rails](https://learn.microsoft.com/en-us/windows-hardware/drivers/powermeter/rail_naming)).

Le profil de puissance uProf 5.3 disponible pour certaines familles EPYC fournit des valeurs estimées à partir de l'activité de la plateforme, et non une mesure énergétique isolée et attribuable à un processus; elles ne sont donc pas transformées en kWh ni en euros ([métriques AMD uProf](https://docs.amd.com/r/en-US/57368-uProf-user-guide/Metrics), [processeurs pris en charge](https://docs.amd.com/r/en-US/63856-uProf-release-notes/2.-Supported-Processors)). Le temps CPU et le TDP ne sont pas utilisés comme substituts à l'énergie.

## Texte de portée pour la campagne

> E11 — La métrique « missions réussies par euro » n'est pas mesurable sur l'hôte disponible. La VM Shadow partagée n'expose aucun compteur d'énergie attribuable au processus. Les estimations uProf, CPU ou TDP ne sont pas converties en énergie ni en euros. Les résultats fonctionnels E11 sont rapportés séparément; aucun coût énergétique ni gain de 15 % n'est revendiqué. L'évaluation économique E11 est reportée à une répétition sur matériel dédié avec compteur vérifié, périmètre de mesure fixé et tarif électrique documenté.

Pour reprendre cette mesure, il faut un hôte dédié avec compteur matériel exposé et unités/canal vérifiables, lecture d'énergie avant/après sur le même périmètre isolé, puis tarif €/kWh daté et préenregistré. Cette limite laisse ouvert le préenregistrement confirmatoire tant que le protocole conserve le seuil monétaire.
