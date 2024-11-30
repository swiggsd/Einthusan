#!/bin/sh

set -e

# Navigate to the Vue.js project directory
cd vue

# Build the project
npm run build

# Navigate back to the root directory
cd ../

# You can add any additional commands here if needed.

echo "Build completed successfully."