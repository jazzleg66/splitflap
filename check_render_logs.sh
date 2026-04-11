#!/bin/bash
echo "Checking Render deployment logs..."
echo "Visit: https://dashboard.render.com/services/your-service-id"
echo ""
echo "Or check recent git commits:"
git log --oneline -5
echo ""
echo "Last deployed commit:"
git log -1 --pretty=format:"%H %s"
