#!/bin/bash

# NevoStack Backend Startup Script

echo "🚀 Starting NevoStack HRMS Backend..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found, creating from .env.example..."
    cp .env.example .env
    echo "✅ Please configure your .env file before starting the server"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if MongoDB is running
echo "🔍 Checking MongoDB connection..."
if ! nc -z localhost 27017; then
    echo "⚠️  MongoDB is not running. Starting with Docker..."
    docker-compose up -d mongodb redis
    echo "⏳ Waiting for MongoDB to be ready..."
    sleep 10
fi

# Run database migrations/seeders if needed
if [ "$1" = "--with-seed" ]; then
    echo "🌱 Seeding database..."
    node scripts/seed.js
fi

# Start the server
echo "🎯 Starting server in ${NODE_ENV:-development} mode..."
if [ "$NODE_ENV" = "production" ]; then
    npm start
else
    npm run dev
fi
