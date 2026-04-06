#!/bin/bash
set -e

cd /Users/minhthiennguyen/Desktop/job-tracker

# Install main app dependencies
npm install

# Install extension dependencies if extension package exists
if [ -f extension/package.json ]; then
  cd extension && npm install && cd ..
fi
