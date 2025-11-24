#!/bin/bash
# Script to push current branch to QPM-GR repository
# This will REPLACE everything in QPM-GR with the current branch's code

echo "🚀 Pushing to QPM-GR repository..."
echo ""
echo "⚠️  WARNING: This will REPLACE all files in QPM-GR master branch!"
echo "Current branch: $(git branch --show-current)"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Add QPM-GR remote if it doesn't exist
    if ! git remote | grep -q "qpm-gr"; then
        echo "Adding QPM-GR remote..."
        git remote add qpm-gr https://github.com/ryandt2305-cpu/QPM-GR.git
    fi

    # Push current branch to QPM-GR master (force replace everything)
    echo "Pushing to QPM-GR master branch..."
    git push qpm-gr HEAD:master --force

    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Successfully pushed to QPM-GR!"
        echo "🔗 View at: https://github.com/ryandt2305-cpu/QPM-GR"
    else
        echo ""
        echo "❌ Push failed. Please check your GitHub credentials."
    fi
else
    echo "Cancelled."
fi
