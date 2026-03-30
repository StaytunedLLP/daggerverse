#!/bin/bash
# Mock gh CLI for coverage testing

# getIssueTypes path
if [[ "$*" == *"api orgs/mock-org/issue-types"* ]]; then
  echo '{"name":"Valid"}'
  echo 'Invalid JSON'
  exit 0
fi

if [[ "$*" == *"api orgs/break-json/issue-types"* ]]; then
    echo '{"name":'
    exit 0
fi

if [[ "$*" == *"api orgs/fail-org/issue-types"* ]]; then
    exit 1
fi

# getRepoInfo path
if [[ "$*" == *"repo view --json name,owner"* ]]; then
  if [[ "$*" == *"fail"* ]] || [[ "$*" == *"nonexistent"* ]]; then
    exit 1
  fi
  if [[ "$*" == *"break-json"* ]]; then
    echo '{"owner":'
    exit 0
  fi
  echo '{"owner":{"login":"mock-owner"},"name":"mock-repo"}'
  exit 0
fi

# getIssue path
if [[ "$*" == *"issue view"* && "$*" == *"--json id"* ]]; then
  if [[ "$*" == *"999"* ]] || [[ "$*" == *"nonexistent"* ]]; then
    exit 1
  fi
  if [[ "$*" == *"888"* ]]; then
    echo "This is not JSON"
    exit 0
  fi
  echo '{"id": "123"}'
  exit 0
fi

# findIssueByTitle / issue list path
if [[ "$*" == *"issue list"* ]]; then
    if [[ "$*" == *"trigger-fail"* ]]; then
        exit 1
    fi
     if [[ "$*" == *"nonexistent"* ]]; then
        echo "[]"
        exit 0
    fi
    echo '[{"number": 1, "title": "test"}]'
    exit 0
fi

# closeIssue / issue close path
if [[ "$*" == *"issue close"* ]]; then
    if [[ "$*" == *"999"* ]]; then
        exit 1
    fi
    exit 0
fi

# createIssue path
if [[ "$*" == *"api -X POST"* ]]; then
    if [[ "$*" == *"fail-me"* ]] || [[ "$*" == *"nonexistent"* ]]; then
        exit 1
    fi
    if [[ "$*" == *"break-json"* ]]; then
        echo '{"incomplete": '
        exit 0
    fi
    echo '{"number": 1, "id": 1, "node_id": "n1", "html_url": "url", "title": "t"}'
    exit 0
fi

# getDatabaseId path
if [[ "$*" == *"api graphql"* ]]; then
    if [[ "$*" == *"fail-graphql"* ]] || [[ "$*" == *"nonexistent"* ]]; then
        exit 1
    fi
    if [[ "$*" == *"faulty-node"* ]]; then
        echo '{"data": {"node": null}}'
        exit 0
    fi
    if [[ "$*" == *"bad-json"* ]]; then
        echo "{"
        exit 0
    fi
    if [[ "$*" == *"invalid-node-id"* ]]; then
        echo '{"data": {"node": null}}'
        exit 0
    fi
    echo '{"data": {"node": {"databaseId": 555}}}'
    exit 0
fi

# setIssueType path
if [[ "$*" == *"api -X PATCH"* ]]; then
    if [[ "$*" == *"fail"* ]] || [[ "$*" == *"nonexistent"* ]]; then
        exit 1
    fi
    echo '{"status": "ok"}'
    exit 0
fi

# gcloud mock
if [[ "$*" == *"gcloud auth application-default print-access-token"* ]]; then
    if [[ "$GH_MOCK_FAIL" == "true" ]]; then
        exit 1
    fi
    echo "mock-access-token"
    exit 0
fi

# setIssueFieldValue path
if [[ "$*" == *"api -X PUT"* && "$*" == *"issue-field-values"* ]]; then
    if [[ "$*" == *"fail"* ]] || [[ "$*" == *"nonexistent"* ]]; then
        exit 1
    fi
    echo '{"status": "ok"}'
    exit 0
fi

# Default behavior: if NOT mock, use real gh if it exists
if [ -f /usr/bin/gh ]; then
  /usr/bin/gh "$@"
else
  exit 1
fi
