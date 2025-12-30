# Multi-Tenant Deployment Architecture

## Overview

This document outlines the production deployment architecture for the Assessment App's multi-tenant platform, supporting both shared and premium (single-tenant) deployments for the rubickstricks.com domain.

## Architecture Components

### 1. Shared Multi-Tenant Deployment (Primary)

```
Internet → Load Balancer → BFF (Port 80/443) → Headless API
                    ↓
            Consumer Portal (SPA)
```

**Components:**

- **Load Balancer**: Distributes traffic across BFF instances
- **BFF (Backend-for-Frontend)**: Tenant-aware API gateway and session management
- **Headless API**: Business logic and data persistence (shared across tenants)
- **Consumer Portal**: Single-page application served by BFF

### 2. Premium Single-Tenant Deployment (Per Customer)

```
Internet → Customer Domain → Reverse Proxy → BFF + Portal
                                      ↓
                               Headless API (Isolated)
```

**Components:**

- **Reverse Proxy**: Customer-specific domain routing
- **BFF + Portal**: Combined deployment for single tenant
- **Headless API**: Isolated instance per customer

## Domain Strategy

### Shared Deployment

- **Primary Domain**: `app.rubickstricks.com`
- **Tenant Resolution**: Hostname-based routing
  - `tenant1.app.rubickstricks.com` → Tenant 1
  - `tenant2.app.rubickstricks.com` → Tenant 2

### Premium Deployment

- **Custom Domains**: `assessments.customer.com`
- **Subdomains**: `assessments.customer.com`

## Request Flow

### Shared Deployment Flow

```
1. User visits tenant1.app.rubickstricks.com
2. DNS resolves to load balancer
3. Load balancer forwards to BFF instance
4. BFF resolves tenant by Host header
5. BFF proxies request to shared Headless API with tenant context
6. Response returned through BFF to client
```

### Premium Deployment Flow

```
1. User visits assessments.customer.com
2. DNS resolves to customer's infrastructure
3. Reverse proxy forwards to tenant-specific BFF
4. BFF serves tenant-specific portal and APIs
5. Isolated Headless API handles business logic
```

## Tenant Configuration

### BFF Configuration (tenants.json)

```json
{
  "tenants": [
    {
      "tenantId": "tenant-demo",
      "name": "Demo Tenant",
      "hosts": ["localhost:4000", "tenant1.app.rubickstricks.com"],
      "clientApp": {
        "baseUrl": "https://tenant1.app.rubickstricks.com",
        "landingPath": "/overview"
      },
      "headless": {
        "baseUrl": "https://api.rubickstricks.com",
        "apiKey": "${TENANT_API_KEY}",
        "tenantId": "tenant-demo"
      }
    }
  ]
}
```

### Environment Variables

```bash
# BFF Configuration
PORT=80
TENANT_CONFIG_PATH=/etc/rubickstricks/tenants.json
CONTROL_PLANE_BASE_URL=https://control.rubickstricks.com
CONTROL_PLANE_API_KEY=${CONTROL_PLANE_KEY}

# Headless API Configuration
DATABASE_URL=${TENANT_DATABASE_URL}
REDIS_URL=${TENANT_CACHE_URL}
```

## Infrastructure Requirements

### Shared Deployment

- **Load Balancer**: AWS ALB/NLB, Nginx, or Traefik
- **BFF Cluster**: 3+ instances across AZs
- **Headless API Cluster**: 3+ instances across AZs
- **Database**: Multi-tenant PostgreSQL with row-level security
- **Cache**: Redis cluster with tenant isolation
- **CDN**: CloudFront/S3 for static assets

### Premium Deployment

- **Per Tenant**:
  - Dedicated BFF instance
  - Dedicated Headless API instance
  - Isolated database schema
  - Customer-specific domain SSL

## Scaling Strategy

### Horizontal Scaling

- **BFF**: Stateless, scale based on request volume
- **Headless API**: Scale based on compute-intensive operations
- **Database**: Read replicas for tenant-specific queries

### Vertical Scaling

- **Premium Tenants**: Dedicated resources based on SLA
- **Shared Tenants**: Resource limits and throttling

## Security Considerations

### Multi-Tenant Isolation

- **Network**: VPC isolation between tenants
- **Database**: Row-level security and tenant_id columns
- **Cache**: Tenant-prefixed keys
- **Secrets**: Per-tenant encryption keys

### Authentication & Authorization

- **JWT Tokens**: Tenant-scoped sessions
- **API Keys**: Tenant-specific API credentials
- **CORS**: Origin validation per tenant

## Monitoring & Observability

### Metrics

- **Per Tenant**: Request volume, error rates, latency
- **System**: CPU, memory, database connections
- **Business**: Assessment completion rates, user engagement

### Logging

- **Structured Logs**: Tenant ID, user ID, request ID
- **Central Aggregation**: ELK stack or CloudWatch
- **Alerting**: Per-tenant thresholds

## Deployment Process

### Shared Tenant Onboarding

1. Create tenant record in Control Plane
2. Configure DNS (CNAME to load balancer)
3. Generate tenant-specific API keys
4. Update BFF tenant configuration
5. Deploy configuration changes

### Premium Tenant Setup

1. Provision isolated infrastructure
2. Configure custom domain SSL
3. Deploy tenant-specific BFF and API
4. Migrate tenant data
5. Update DNS records

## Cost Optimization

### Shared Deployment

- **Compute**: Auto-scaling based on aggregate load
- **Storage**: Multi-tenant database with efficient partitioning
- **Bandwidth**: CDN for static assets

### Premium Deployment

- **Dedicated Resources**: Higher cost but guaranteed performance
- **Resource Optimization**: Right-sizing based on tenant usage
- **Reserved Instances**: Cost savings for long-term tenants

## Disaster Recovery

### Shared Deployment

- **Multi-AZ**: Automatic failover across availability zones
- **Database**: Cross-region replication
- **Backup**: Automated tenant data backups

### Premium Deployment

- **Per Tenant**: Isolated recovery procedures
- **Data Export**: Tenant data portability
- **Failover**: Customer-specific DR plans

## Migration Strategy

### From Single-Tenant to Multi-Tenant

1. **Data Migration**: Export tenant data with tenant_id
2. **Schema Updates**: Add tenant_id columns
3. **Application Updates**: Multi-tenant middleware
4. **Testing**: Tenant isolation validation

### From Shared to Premium

1. **Data Export**: Extract tenant data
2. **Infrastructure Provisioning**: Set up isolated environment
3. **Application Deployment**: Tenant-specific configuration
4. **DNS Updates**: Point to new infrastructure

## Tenant Identification in SaaS Platforms

### Standard Approaches

#### 1. **Token-Embedded Tenant ID** (Current Implementation)
```javascript
// JWT Payload includes tenant context
{
  "sub": "user-uuid",
  "email": "user@company.com",
  "tenantId": "tenant-123",  // ← Tenant embedded in token
  "roles": ["LEARNER"]
}
```
**Pros**: Simple, self-contained tokens
**Cons**: Less flexible, requires re-authentication for tenant switches

#### 2. **Request-Header Based** (Alternative Approach)
```javascript
// Token identifies user, header specifies tenant context
Authorization: Bearer <user-jwt>
x-tenant-id: tenant-123  // ← Tenant from request context
```
**Pros**: More flexible, supports multi-tenant users
**Cons**: Requires header validation on every request

#### 3. **Hostname-Based** (Your Current Setup)
```javascript
// Tenant resolved from request hostname
Host: tenant1.app.rubickstricks.com → tenantId: "tenant-123"
Authorization: Bearer <user-jwt>
```
**Pros**: Clean URLs, automatic tenant isolation
**Cons**: Requires DNS configuration per tenant

### Security Considerations

#### Token Scope & Isolation
- **User tokens should be tenant-agnostic** - identify the user, not their current tenant context
- **Tenant validation happens at application level** - ensure user has access to the requested tenant
- **Never trust tenant ID from client** - always validate against user's allowed tenants

#### Multi-Tenant User Scenarios
```javascript
// User belongs to multiple tenants
const userTenants = await db.getUserTenants(userId);
// Validate requested tenant is in allowed list
if (!userTenants.includes(requestedTenantId)) {
  throw new ForbiddenError();
}
```

### Recommended SaaS Pattern

**Hybrid Approach (Recommended):**
1. JWT identifies user + their base tenant
2. Request context (hostname/header) specifies target tenant
3. Application validates user has access to target tenant
4. Database queries are scoped to validated tenant

This provides maximum flexibility while maintaining security.

## Performance Benchmarks

### Target SLAs

- **API Response Time**: <200ms P95
- **Page Load Time**: <2s
- **Uptime**: 99.9% shared, 99.95% premium

### Capacity Planning

- **Concurrent Users**: 10,000+ per shared cluster
- **Requests/Second**: 1,000+ per BFF instance
- **Database Connections**: 100+ per tenant pool
