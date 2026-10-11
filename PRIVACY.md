# Privacy

The node sends your prompt, Imagine settings and API token to `https://api.acedata.cloud/midjourney/imagine`. It queries existing task IDs at `https://api.acedata.cloud/midjourney/tasks`. The node does not contact another host, read local files or environment variables, or add telemetry. n8n stores the token in its credential store; workflow exports should not contain it.

See the [Ace Data Cloud privacy policy](https://platform.acedata.cloud/privacy) and [current Midjourney details](https://platform.acedata.cloud/documents/midjourney-imagine).
