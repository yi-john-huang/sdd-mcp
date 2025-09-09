# MCP SDD Server Deployment Guide

This document provides comprehensive instructions for deploying the MCP SDD Server in various environments.

## Quick Start

### Local Development
```bash
# Clone and install
git clone <repository-url>
cd sdd-mcp-server
npm install

# Run in development mode
npm run dev

# Or build and run production locally
npm run build
npm start
```

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f sdd-mcp-server

# Scale if needed
docker-compose up -d --scale sdd-mcp-server=3
```

## Environment Configuration

### Required Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `development` | No |
| `LOG_LEVEL` | Logging level | `info` | No |
| `PORT` | Server port | `3000` | No |

### Optional Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PLUGIN_DIR` | Plugin directory path | `./plugins` | `/app/plugins` |
| `TEMPLATE_DIR` | Template directory path | `./templates` | `/app/templates` |
| `DATA_DIR` | Data storage path | `./data` | `/app/data` |
| `DEFAULT_LANG` | Default language | `en` | `es` |
| `MAX_PLUGINS` | Maximum concurrent plugins | `100` | `50` |
| `HOOK_TIMEOUT` | Hook execution timeout (ms) | `5000` | `10000` |
| `REDIS_URL` | Redis connection URL | - | `redis://localhost:6379` |
| `DATABASE_URL` | Database connection URL | - | `postgres://user:pass@host:5432/db` |

### Advanced Configuration

#### Plugin System
```bash
# Plugin discovery settings
PLUGIN_AUTO_DISCOVER=true
PLUGIN_SCAN_INTERVAL=300000  # 5 minutes
PLUGIN_MAX_MEMORY=128MB

# Plugin security
PLUGIN_SANDBOX_ENABLED=true
PLUGIN_ALLOWED_MODULES=fs,path,crypto
PLUGIN_BLOCKED_MODULES=child_process,cluster
```

#### Performance Tuning
```bash
# Memory and CPU limits
NODE_OPTIONS="--max-old-space-size=4096"
UV_THREADPOOL_SIZE=16

# Request handling
MAX_CONCURRENT_REQUESTS=1000
REQUEST_TIMEOUT=30000

# Template rendering
TEMPLATE_CACHE_SIZE=500
TEMPLATE_CACHE_TTL=3600000  # 1 hour
```

## Deployment Options

### 1. Docker Deployment

#### Simple Docker Run
```bash
# Build image
docker build -t sdd-mcp-server .

# Run container
docker run -d \
  --name sdd-mcp-server \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  -v $(pwd)/plugins:/app/plugins:ro \
  -v $(pwd)/templates:/app/templates:ro \
  -v sdd_data:/app/data \
  sdd-mcp-server
```

#### Docker Compose (Recommended)
```bash
# Production deployment with all services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Development with hot reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### 2. Kubernetes Deployment

#### Basic Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sdd-mcp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: sdd-mcp-server
  template:
    metadata:
      labels:
        app: sdd-mcp-server
    spec:
      containers:
      - name: sdd-mcp-server
        image: sdd-mcp-server:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: LOG_LEVEL
          value: "info"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        volumeMounts:
        - name: plugins
          mountPath: /app/plugins
          readOnly: true
        - name: templates
          mountPath: /app/templates
          readOnly: true
        - name: data
          mountPath: /app/data
      volumes:
      - name: plugins
        configMap:
          name: sdd-plugins
      - name: templates
        configMap:
          name: sdd-templates
      - name: data
        persistentVolumeClaim:
          claimName: sdd-data-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: sdd-mcp-server-service
spec:
  selector:
    app: sdd-mcp-server
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

#### Helm Chart
```bash
# Install with Helm
helm install sdd-mcp-server ./helm/sdd-mcp-server \
  --set image.tag=latest \
  --set replicaCount=3 \
  --set resources.requests.memory=256Mi
```

### 3. Cloud Platform Deployments

#### AWS ECS
```json
{
  "family": "sdd-mcp-server",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "sdd-mcp-server",
      "image": "your-repo/sdd-mcp-server:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "LOG_LEVEL", "value": "info"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/sdd-mcp-server",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

#### Google Cloud Run
```bash
# Deploy to Cloud Run
gcloud run deploy sdd-mcp-server \
  --image gcr.io/PROJECT_ID/sdd-mcp-server \
  --platform managed \
  --region us-central1 \
  --port 3000 \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars NODE_ENV=production,LOG_LEVEL=info \
  --allow-unauthenticated
```

#### Azure Container Instances
```bash
# Create container group
az container create \
  --resource-group myResourceGroup \
  --name sdd-mcp-server \
  --image myregistry.azurecr.io/sdd-mcp-server:latest \
  --cpu 1 \
  --memory 1 \
  --ports 3000 \
  --environment-variables NODE_ENV=production LOG_LEVEL=info \
  --dns-name-label sdd-mcp-server
```

## Production Considerations

### Security

#### Container Security (Distroless)

The MCP SDD Server uses Google's distroless container images for maximum security:

```bash
# Build distroless production image
docker build --target production -t sdd-mcp-server-secure .

# Security features included:
# - No shell, package managers, or unnecessary binaries
# - Minimal attack surface with only Node.js runtime
# - Non-root user execution (UID 1001)
# - Read-only filesystem protection
# - Dropped Linux capabilities
# - no-new-privileges security option
```

**Container Security Benefits:**
- **Reduced CVE exposure**: Only essential runtime libraries included
- **No privilege escalation**: Cannot gain root access or install packages
- **Immutable filesystem**: Application files cannot be modified at runtime
- **Minimal capabilities**: Only SETUID/SETGID for Node.js process management
- **No debugging tools**: Attackers cannot use shells or system utilities

**Security Validation:**
```bash
# Verify non-root execution
docker run --rm sdd-mcp-server-secure whoami  # Should fail (no shell)

# Check security options
docker inspect sdd-mcp-server-secure | grep -A5 SecurityOpt

# Verify read-only filesystem
docker run --rm sdd-mcp-server-secure touch /test  # Should fail
```

#### SSL/TLS Configuration
```bash
# Generate self-signed certificate for testing
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/private.key \
  -out ssl/certificate.crt

# Use Let's Encrypt for production
certbot certonly --standalone -d yourdomain.com
```

#### Environment Security
```bash
# Use secrets management
export PLUGIN_ENCRYPTION_KEY=$(openssl rand -base64 32)
export SESSION_SECRET=$(openssl rand -base64 32)
export API_KEY_SALT=$(openssl rand -base64 16)
```

### Monitoring and Logging

#### Health Checks
```bash
# Built-in health endpoint
curl http://localhost:3000/health

# Custom health check script
#!/bin/bash
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
if [ $response -eq 200 ]; then
  echo "Service is healthy"
  exit 0
else
  echo "Service is unhealthy: $response"
  exit 1
fi
```

#### Log Configuration
```bash
# Structured logging with JSON
export LOG_FORMAT=json
export LOG_TIMESTAMP=true
export LOG_CORRELATION_ID=true

# Log rotation
export LOG_MAX_SIZE=100MB
export LOG_MAX_FILES=10
export LOG_ROTATION_INTERVAL=daily
```

### Performance Optimization

#### Load Balancing
```nginx
upstream sdd_mcp_backend {
    least_conn;
    server sdd-mcp-1:3000 weight=3;
    server sdd-mcp-2:3000 weight=3;
    server sdd-mcp-3:3000 weight=2;
    keepalive 32;
}

server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://sdd_mcp_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
}
```

#### Caching Strategy
```bash
# Redis configuration for caching
export REDIS_HOST=localhost
export REDIS_PORT=6379
export CACHE_TTL=3600
export CACHE_PREFIX=sdd:

# Enable response caching
export ENABLE_RESPONSE_CACHE=true
export RESPONSE_CACHE_TTL=300
```

### Backup and Recovery

#### Data Backup
```bash
#!/bin/bash
# Backup script
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/sdd-mcp/$DATE"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup data directory
tar -czf $BACKUP_DIR/data.tar.gz /app/data/

# Backup configuration
cp /app/config/* $BACKUP_DIR/

# Backup plugins
tar -czf $BACKUP_DIR/plugins.tar.gz /app/plugins/

echo "Backup completed: $BACKUP_DIR"
```

#### Disaster Recovery
```bash
#!/bin/bash
# Recovery script
BACKUP_DATE=$1

if [ -z "$BACKUP_DATE" ]; then
  echo "Usage: $0 <backup_date>"
  exit 1
fi

BACKUP_DIR="/backups/sdd-mcp/$BACKUP_DATE"

# Stop service
docker-compose down

# Restore data
tar -xzf $BACKUP_DIR/data.tar.gz -C /

# Restore configuration
cp $BACKUP_DIR/config/* /app/config/

# Restore plugins
tar -xzf $BACKUP_DIR/plugins.tar.gz -C /

# Start service
docker-compose up -d

echo "Recovery completed from backup: $BACKUP_DATE"
```

## Troubleshooting

### Common Issues

#### Service Won't Start
```bash
# Check logs
docker-compose logs sdd-mcp-server

# Check configuration
docker exec sdd-mcp-server env

# Test connectivity
docker exec sdd-mcp-server curl localhost:3000/health
```

#### Plugin Loading Issues
```bash
# Check plugin directory permissions
ls -la /app/plugins/

# Validate plugin manifests
find /app/plugins -name "plugin.json" -exec echo "=== {} ===" \; -exec cat {} \;

# Debug plugin loading
export DEBUG=plugin:*
npm start
```

#### Memory Issues
```bash
# Monitor memory usage
docker stats sdd-mcp-server

# Increase memory limit
docker update --memory=2g sdd-mcp-server

# Enable memory profiling
export NODE_OPTIONS="--inspect=0.0.0.0:9229"
```

### Performance Tuning

#### Optimize for High Load
```bash
# Increase worker processes
export CLUSTER_WORKERS=4

# Tune garbage collection
export NODE_OPTIONS="--max-old-space-size=4096 --gc-interval=100"

# Enable connection pooling
export DB_POOL_SIZE=20
export DB_POOL_TIMEOUT=30000
```

#### Monitor Performance
```bash
# Enable performance metrics
export ENABLE_METRICS=true
export METRICS_PORT=9090

# Custom performance monitoring
curl http://localhost:9090/metrics
```

## Maintenance

### Regular Tasks
- Update dependencies monthly
- Rotate logs weekly
- Backup data daily
- Monitor disk usage
- Review security patches
- Update SSL certificates
- Clean up old Docker images

### Update Procedure
```bash
# 1. Backup current state
./backup.sh

# 2. Pull new version
docker pull sdd-mcp-server:latest

# 3. Update with zero downtime
docker-compose up -d --no-deps --scale sdd-mcp-server=2 sdd-mcp-server
docker-compose up -d --no-deps --remove-orphans

# 4. Verify deployment
curl http://localhost:3000/health
```

For additional support and advanced configurations, consult the main documentation or contact the development team.