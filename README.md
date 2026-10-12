# Midjourney for n8n: first image

Generate one Midjourney image grid, then query the same task until it finishes. This community package connects only Midjourney through Ace Data Cloud. The screenshots below show an actual self-hosted n8n 2.42.3 instance in English. n8n Creator Portal verification is pending.

**Package:** `@acedatacloud/n8n-nodes-midjourney` · [Midjourney Imagine API and pricing](https://platform.acedata.cloud/documents/midjourney-imagine?utm_source=opensource&utm_medium=referral&utm_campaign=evergreen&utm_content=midjourneyn8n_readme_documents_midjourney_imagine) · [Source](https://github.com/AceDataCloud/MidjourneyN8N)

## Quick start

### 1. Install the node

In self-hosted n8n, sign in as an owner or admin. Open **Settings → Community nodes → Install**, enter `@acedatacloud/n8n-nodes-midjourney`, review the author **Ace Data Cloud**, accept the installation notice and select **Install**. Your server needs HTTPS access to npm and `api.acedata.cloud`. [n8n's installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/gui-installation/) covers prerequisites. n8n Cloud exposes community nodes in its picker only after verification.

![Midjourney in the local n8n node picker](https://raw.githubusercontent.com/AceDataCloud/MidjourneyN8N/main/_assets/tutorial/01-node-picker.png)

### 2. Get an API key with Midjourney access

New account? Register and sign in first. If the Applications page has no General application yet, choose **Initialize General Application**, then continue with the key steps below.

1. Sign in at [Ace Data Cloud → Applications](https://platform.acedata.cloud/console/applications?utm_source=opensource&utm_medium=referral&utm_campaign=evergreen&utm_content=midjourneyn8n_readme_api_key).
2. Open **General application** and copy its API key, or choose **Manage Keys → Create** for a separate n8n key.
3. Check Midjourney access, current pricing and balance. If **Allowed APIs** is enabled, include both `/midjourney/imagine` and `/midjourney/tasks`.

![Copy a key or open Manage Keys](https://raw.githubusercontent.com/AceDataCloud/MidjourneyDify/69ee2ae3ebc005adad09872690b9808df3609505/_assets/tutorial/get-api-key-en.png)

![Create a separate key](https://raw.githubusercontent.com/AceDataCloud/MidjourneyDify/69ee2ae3ebc005adad09872690b9808df3609505/_assets/tutorial/create-api-key-en.png)

Copy only the application token. Do not include `Bearer `, quotation marks or a platform management token. Keep it out of workflow exports and screenshots.

### 3. Save the credential in n8n

Add **Midjourney by Ace Data Cloud** to a workflow. In **Credential**, choose **Connect to Midjourney by Ace Data Cloud** and create a new credential. Paste the token into **API Token**. Set **Allowed HTTP Request Domains** to **Specific Domains → `api.acedata.cloud`** and save. Use the same credential on **Imagine** and **Get Task**.

The credential test calls the free `/openai/models` metadata route. It checks the token, while the first Imagine call checks Midjourney access.

![Midjourney credential form](https://raw.githubusercontent.com/AceDataCloud/MidjourneyN8N/main/_assets/tutorial/02-credential.png)

### 4. Import and run the smallest workflow

[Download the credential-free quickstart](https://github.com/AceDataCloud/MidjourneyN8N/raw/refs/heads/main/examples/quickstart.json). In a new n8n workflow, choose **⋯ → Import → From file** and assign your credential to both Midjourney nodes. The path is **Start → Imagine → Wait 30 Seconds → Get Task**.

![Imported Midjourney workflow in n8n 2.42.3](https://raw.githubusercontent.com/AceDataCloud/MidjourneyN8N/main/_assets/tutorial/03-workflow.png)

| Imagine field | First-run value |
| --- | --- |
| Resource / Operation | Image / Imagine |
| Version | 8.2 |
| Mode | Fast |

Prompt: `A teal ceramic cube on a cream background, studio product photograph --ar 1:1`

Check current version 8.2 Fast pricing and account balance before executing. Keep **Retry On Fail** off and select **Execute workflow** once. Imagine submits `action=generate` with `async=true`, returning `taskId` and status `submitted`; that is not a completed image. **Get Task** points to **Imagine → taskId**, so it queries the same task after the wait.

![Midjourney Imagine settings](https://raw.githubusercontent.com/AceDataCloud/MidjourneyN8N/main/_assets/tutorial/04-configure.png)

### 5. Confirm the result and charge

Open **Get Task** output. Continue only when `status=succeeded`, `finished=true` and `successful=true`; then open the returned `imageUrls`. Midjourney Imagine creates a 2×2 grid. `image_url` is the preview; `raw_image_url` is the larger original when present. If the task is still processing, **do not rerun the full workflow**: it would create another paid image. Use the [query-only workflow](https://github.com/AceDataCloud/MidjourneyN8N/raw/refs/heads/main/examples/query-existing-task.json) with the original ID. The [bounded polling workflow](https://github.com/AceDataCloud/MidjourneyN8N/raw/refs/heads/main/examples/generate-and-wait.json) queries that ID for up to 30 minutes without creating another task.

Compare the task's trace ID and execution time with [Ace Data Cloud usage history](https://platform.acedata.cloud/console?utm_source=opensource&utm_medium=referral&utm_campaign=evergreen&utm_content=midjourneyn8n_readme_console). Any `cost.amount` is in **Credits**, not USD. Price depends on version, mode and your account package. A previous version 8.2 Fast image succeeded in Dify and deducted `0.27 Credits` under that test account; it is not a call made by this n8n package. A credentialed n8n result and bill have not yet been verified for this release.

## Other options and troubleshooting

Version and mode change price. Version 8.1 does not support Turbo. Prompt flags such as `--ar 1:1` belong inside the prompt text. **Task → Get Many** queries up to 50 existing IDs without generation. Upscale, variation, edit and video generation are separate billable operations and are not exposed by this first release without separate n8n validation.

| What you see | What to check |
| --- | --- |
| 401 or 403 | Check the full application token, expiry, Midjourney access, balance and Allowed APIs for both endpoints. |
| 400 | Use the first-run version, mode and prompt; version 8.1 cannot use Turbo. |
| submitted or processing | Query the same task ID. Do not rerun Imagine to poll. |
| 429 | Reduce concurrency and keep automatic retries off. |
| Timeout or 5xx | Inspect the original task and usage history before submitting again; the first request may have been accepted. |
| Image link fails | Wait for terminal success, then open the returned URL directly. |

Each input item can create one paid task. The node does not automatically retry or follow HTTP redirects, and task output omits known credential, request and internal routing fields. [Privacy](https://github.com/AceDataCloud/MidjourneyN8N/blob/main/PRIVACY.md) · [Report an issue](https://github.com/AceDataCloud/MidjourneyN8N/issues) · dev@acedata.cloud
