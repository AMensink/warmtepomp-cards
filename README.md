# Warmtepomp Cards voor Home Assistant

Twee geanimeerde dashboardkaarten voor Home Assistant die live laten zien wat je warmtepomp en warmtepompboiler doen: draaiende ventilator, stromend water, kleur van leidingen en tank op basis van temperatuur, ontdooi- en storingsindicatie.

| Kaart | Type |
|---|---|
| **Warmtepomp monoblock (geanimeerd)** — buitenunit, buffervat, cv-pomp, radiatoren en vloerverwarming met verdeler | `custom:heatpump-monoblock-card` |
| **Warmtepompboiler (geanimeerd)** — doorsnede van een warmtepompboiler met condensorspiraal, element en tapwater | `custom:heatpump-boiler-card` |

![Warmtepomp monoblock](images/monoblock.png)
![Warmtepompboiler](images/boiler.png)

> 🇬🇧 *Two animated Lovelace cards for a monoblock heat pump and a heat pump water heater. Labels are in Dutch; configuration is below.*

---

## Installatie

### Via HACS (aanbevolen)

1. Open **HACS** in Home Assistant.
2. Klik rechtsboven op ⋮ → **Aangepaste repositories**.
3. Plak de URL van deze repository, kies type **Dashboard** en klik **Toevoegen**.
4. Zoek **Warmtepomp Cards**, klik **Downloaden** en herlaad de browser.

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=AMensink&repository=warmtepomp-cards&category=plugin)

### Handmatig

1. Download `dist/warmtepomp-cards.js` en zet het in `/config/www/`.
2. Ga naar **Instellingen → Dashboards → ⋮ → Resources → Resource toevoegen**.
3. URL: `/local/warmtepomp-cards.js`, type: **JavaScript-module**.
4. Herlaad de browser.

---

## Gebruik

Na installatie verschijnen beide kaarten in de kaartkiezer bij het bewerken van een dashboard. Omdat iedere installatie andere entiteitsnamen heeft, stel je je eigen sensoren in via de YAML-editor van de kaart onder `entities:`. Alles wat je niet invult valt terug op de standaardnamen van de **Tuya Heat Pump**-integratie (apparaatnamen `warmtepomp` en `boiler`). Ontbrekende entiteiten tonen gewoon `–`.

### Warmtepomp monoblock

```yaml
type: custom:heatpump-monoblock-card
title: Warmtepomp
buffer_liters: 30
entities:
  supply: sensor.warmtepomp_outlet_water_temperature   # aanvoer
  return: sensor.warmtepomp_inlet_water_temperature    # retour
  flow: sensor.warmtepomp_water_flow_rate              # debiet in L/min
  power: sensor.warmtepomp_power                       # elektrisch vermogen in W
  thermostat: climate.woonkamer                        # optioneel: stuurt de cv-pomp-animatie
  floor_pump: switch.vloerverwarming_pomp              # optioneel: pomp vloerverwarming
```

| Optie | Omschrijving |
|---|---|
| `title` | Titel van de kaart (standaard `Warmtepomp`) |
| `buffer_liters` | Inhoud buffervat die in de tekening staat (standaard `30`) |

| Entiteit | Betekenis |
|---|---|
| `supply` / `return` | Aanvoer- en retourtemperatuur water |
| `ambient` | Buitenluchttemperatuur |
| `coil` | Verdampertemperatuur |
| `exhaust` / `suction` | Pers- en zuiggastemperatuur |
| `hp_sat` | Condensatietemperatuur (hogedruk-verzadiging) |
| `eev` | Positie expansieventiel |
| `flow` | Waterdebiet (L/min) — gebruikt voor warmte-afgifte en COP |
| `fan_hz` / `comp_hz` | Frequentie ventilator / compressor |
| `compressor` | Compressor aan/uit (als er geen frequentie is) |
| `defrost` | Ontdooien aan/uit |
| `online` | Online-status |
| `fault` | Storingscode (0 = geen storing) |
| `power_switch` | Aan/uit-schakelaar warmtepomp |
| `setpoint` | Gewenste aanvoertemperatuur |
| `mode` / `work_mode` / `curve` | Modus, werkstand en stooklijn |
| `power` | Elektrisch vermogen (W) |
| `energy_today` / `energy_total` | Energie vandaag / totaal |
| `thermostat` | `climate`-entiteit; bij `hvac_action: heating` draait de cv-pomp, en de kamertemperatuur bepaalt waar de leidingkleur van blauw naar warm omslaat |
| `floor_pump` | Schakelaar/stekker van de vloerverwarmingspomp |

### Warmtepompboiler

```yaml
type: custom:heatpump-boiler-card
title: Warmtepompboiler
min_temp: 15
entities:
  tank_temp: sensor.boiler_inlet_water_temperature
  setpoint: number.boiler_water_temperature_setpoint
  power: sensor.boiler_stekker_vermogen        # optioneel
  energy_today: sensor.boiler_energie_vandaag  # optioneel
  energy_month: sensor.boiler_energie_maand    # optioneel
```

| Optie | Omschrijving |
|---|---|
| `title` | Titel van de kaart (standaard `Warmtepompboiler`) |
| `min_temp` | Temperatuur die als "leeg" geldt voor de vulgraad (standaard `15`) |

| Entiteit | Betekenis |
|---|---|
| `tank_temp` | Watertemperatuur in de tank |
| `setpoint` | Gewenste temperatuur |
| `ambient` / `coil` / `exhaust` / `return_gas` | Luchtinlaat-, verdamper-, persgas- en zuiggastemperatuur |
| `eev` | Positie expansieventiel |
| `fan` | Ventilatorstatus |
| `compressor` / `water_pump` / `heater` | Compressor, waterpomp en elektrisch element aan/uit |
| `defrost` | Ontdooien |
| `power_switch` | Aan/uit-schakelaar |
| `mode` | Modus (Standard / Boost / Electric Heater) |
| `fault` / `online` | Storingscode en online-status |
| `runtime_defrost` | Looptijd compressor tot volgende ontdooiing (min) |
| `power` / `energy_today` / `energy_month` | Vermogen en verbruik, bijvoorbeeld van een slimme stekker |

Klik op een waarde of onderdeel in de tekening om het detailvenster van die entiteit te openen.

---

## Goed om te weten

- De kaarten zijn gemaakt voor een Tuya-warmtepomp (Heative Next290) via de *Tuya Heat Pump*-integratie, maar werken met elke warmtepomp waarvan je vergelijkbare sensoren hebt.
- De getoonde COP is een schatting: debiet × 4,186 × ΔT gedeeld door het elektrisch vermogen.
- Animaties stoppen automatisch als je apparaat "verminderde beweging" heeft ingesteld.

## Licentie

MIT — zie [LICENSE](LICENSE).
