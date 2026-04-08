#!/bin/bash
set -e

ACCESS_TOKEN=$1
PROJECT_ID=$2
NAMESPACE=$3
OUTPUT_FILE=$4

curl -X GET "https://firebaseremoteconfig.googleapis.com/v1/projects/${PROJECT_ID}/remoteConfig?namespace=${NAMESPACE}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -o "${OUTPUT_FILE}"
