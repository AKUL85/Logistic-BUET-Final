# Architecture Diagram

```mermaid
graph TD
    User([User]) -->|Traffc| Frontend[Frontend React]
    Frontend -->|HTTP| OrderSvc[Order Service API]
    
    subgraph "Service Layer"
        OrderSvc -->|HTTP| InventorySvc[Inventory Service API]
    end
    
    subgraph "Data Layer"
        OrderSvc -->|SQL| OrderDB[(MySQL Order DB)]
        InventorySvc -->|SQL| InventoryDB[(MySQL Inventory DB)]
    end

    subgraph "Monitoring & Observability"
        Prometheus[Prometheus]
        Grafana[Grafana Dashboard]
        AlertManager[AlertManager]
        
        Prometheus -->|Scrape /metrics| OrderSvc
        Prometheus -->|Scrape /metrics| InventorySvc
        
        Grafana -->|Query| Prometheus
        Prometheus -->|Trigger Alert| AlertManager
        AlertManager -->|Notify| Slack[Slack/Email]
    end

    rect rgb(240, 255, 240)
    note right of OrderSvc
      Exposes:
      GET /health
      GET /metrics
    end note
```

## Monitoring Flow
1. **Health Checks**: Each service (`Order`, `Inventory`) exposes a deep `/health` endpoint checking DBs and dependencies.
2. **Metrics**: `Order Service` generates HTTP metrics (latency, errors) via `prom-client`.
3. **Scraping**: `Prometheus` scrapes `http://order-service:3000/metrics` every 5 seconds.
4. **Alerting**: `Prometheus` evaluates rule `HighLatency` (>1s). If true for 5s, it fires an alert to `AlertManager`.
5. **Visualization**: `Grafana` provisioned with a dashboard visualizes Latency and Error Rates from Prometheus.
