#!/usr/bin/env python3
"""Retained command name for old callers. score.py is the only website orchestration entry point."""
import sys

def main():
    print('direct candidate orchestration is disabled; run python3 .claude/rubric/score.py')
    return 2

if __name__ == '__main__':
    sys.exit(main())
