#!/bin/bash
set -e

ACCESS_TOKEN=$1
PROJECT_ID=$2
NAMESPACE=$3
ETAG=$4
INPUT_FILE=$5

curl -X PUT "https://firebaseremoteconfig.googleapis.com/v1/projects/${PROJECT_ID}/remoteConfig?namespace=${NAMESPACE}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "If-Match: ${ETAG}" \
  --data-binary @"${INPUT_FILE}"
