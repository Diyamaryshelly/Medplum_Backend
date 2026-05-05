#!/bin/bash
# Quick start script for local development
# This script starts PostgreSQL and Redis in Docker, then runs the server locally

set -e

echo "🚀 Starting Medplum Local Development Environment"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js 22.18.0 or higher."
    exit 1
fi

echo "✅ Docker is running"
echo "✅ Node.js $(node --version) detected"
echo ""

# Start PostgreSQL and Redis
echo "📦 Starting PostgreSQL and Redis in Docker..."
docker-compose -f docker-compose.local-dev.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check if PostgreSQL is ready
until docker-compose -f docker-compose.local-dev.yml exec -T postgres pg_isready -U medplum > /dev/null 2>&1; do
    echo "   Waiting for PostgreSQL..."
    sleep 2
done
echo "✅ PostgreSQL is ready"

# Check if Redis is ready
until docker-compose -f docker-compose.local-dev.yml exec -T redis redis-cli -a medplum ping > /dev/null 2>&1; do
    echo "   Waiting for Redis..."
    sleep 2
done
echo "✅ Redis is ready"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (first time setup)..."
    npm install
    echo ""
fi

# Check if packages are built
if [ ! -d "packages/core/dist" ]; then
    echo "🔨 Building dependencies (first time setup)..."
    npm run build:fast
    echo ""
fi

# Check if database is initialized
echo "🗄️  Checking database..."
if ! docker-compose -f docker-compose.local-dev.yml exec -T postgres psql -U medplum -d medplum -c "SELECT 1 FROM pg_tables WHERE tablename='project' LIMIT 1;" > /dev/null 2>&1; then
    echo "🔧 Running database migrations..."
    npm run migrate --workspace=@medplum/server
    echo ""
fi

echo "✅ All services are ready!"
echo ""
echo "🎯 Starting Medplum Server..."
echo "   Server will be available at: http://localhost:8103"
echo "   Health check: http://localhost:8103/healthcheck"
echo ""
echo "   Press Ctrl+C to stop the server"
echo "   To stop Docker services: docker-compose -f docker-compose.local-dev.yml down"
echo ""

# Start the server
npm run dev --workspace=@medplum/server
