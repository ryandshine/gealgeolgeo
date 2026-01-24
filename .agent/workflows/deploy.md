---
description: Deploy the latest updates to the remote server
---


1. Push local changes to GitHub
```bash
git add .
git commit -m "Deploy latest updates"
git push origin main
```

2. Trigger remote deployment via SSH
```bash
ssh ryandshine@100.66.123.98 "bash /home/ryandshine/gealgeolgeo/deploy.sh"
```
