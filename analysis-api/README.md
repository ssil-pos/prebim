# prebim-analysis-api

Minimal analysis service for PreBIM.

## Run (docker)
```bash
cd analysis-api
docker compose up -d --build
curl -s http://localhost:8009/health
```

## Nginx reverse proxy (recommended)
Serve the static site as-is, and proxy the API so the browser can call it without CORS:

```
location /prebim/api/ {
  proxy_pass http://127.0.0.1:8009/;
}
```

This makes the endpoint available at:
- `POST /prebim/api/analyze`

## Notes
- MVP currently applies member UDL (LIVE). Selfweight is not yet applied because we set rho=0.
  Next step: set material density and use PyNite's self_weight capability, or convert selfweight
  to equivalent member loads.
