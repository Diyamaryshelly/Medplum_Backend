FROM node:24 AS build-stage

WORKDIR /usr/src/medplum

# ── Step 1: Copy root manifests ──────────────────────────────────────────────
COPY package*.json ./
COPY turbo.json ./

# ── Step 2: Copy package.json for EVERY workspace package ────────────────────
# npm needs all workspace package.json files present before "npm install"
# so it can correctly build the dependency graph and link workspaces.
COPY packages/fhirtypes/package.json     ./packages/fhirtypes/
COPY packages/definitions/package.json   ./packages/definitions/
COPY packages/hl7/package.json           ./packages/hl7/
COPY packages/core/package.json          ./packages/core/
COPY packages/fhir-router/package.json   ./packages/fhir-router/
COPY packages/bot-layer/package.json     ./packages/bot-layer/
COPY packages/ccda/package.json          ./packages/ccda/
COPY packages/mock/package.json          ./packages/mock/
COPY packages/react-hooks/package.json   ./packages/react-hooks/
COPY packages/react/package.json         ./packages/react/
COPY packages/app/package.json           ./packages/app/
COPY packages/server/package.json        ./packages/server/
COPY packages/agent/package.json         ./packages/agent/
COPY packages/cli/package.json           ./packages/cli/
COPY packages/graphiql/package.json      ./packages/graphiql/

# ── Step 3: Install all dependencies ─────────────────────────────────────────
RUN npm install

# ── Step 4: Copy full source ──────────────────────────────────────────────────
COPY . .

# ── Step 5: Build ONLY the server and its transitive deps ────────────────────
# @medplum/app is NOT needed — the ENTRYPOINT only runs the server.
RUN npx turbo run build --filter=@medplum/server

# ── Final Stage: Runtime ──────────────────────────────────────────────────────
FROM node:24-slim
WORKDIR /usr/src/medplum

COPY --from=build-stage /usr/src/medplum ./

EXPOSE 8103

ENTRYPOINT [ "node", "--require", "./packages/server/dist/otel/instrumentation.js", "packages/server/dist/index.js" ]
