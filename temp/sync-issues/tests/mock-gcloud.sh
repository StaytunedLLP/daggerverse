#!/bin/bash
# Mock gcloud CLI for coverage testing

if [[ "$*" == *"auth application-default print-access-token"* ]]; then
  if [[ "$GH_MOCK_FAIL" == "true" ]] || [[ "$DEBUG" == "fail" ]]; then
    exit 1
  fi
  echo "mock-access-token"
  exit 0
fi

exit 1
