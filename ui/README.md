# Document Type Detector UI

Minimal single-page React app (Vite) to:

- Drop or choose a file
- Send it to an API using `multipart/form-data`
- Display the detected document type from the API response

## Run

```bash
npm install
npm run dev
```

## API Endpoint

The frontend posts to:

- `VITE_DOC_TYPE_API_URL` (if set), otherwise
- `/api/document-type`

Create a `.env` file if you want a custom endpoint:

```env
VITE_DOC_TYPE_API_URL=http://localhost:8080/api/document-type
```

## Expected Response

The UI reads one of these fields from the JSON response:

- `documentType`
- `type`
- `result`

Example:

```json
{
	"documentType": "invoice"
}
```
