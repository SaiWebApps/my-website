#!/usr/bin/env python3
"""Serialize complete rubric runs. The operating system releases the lock if a run is interrupted."""
import fcntl, json, os, time

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PATH = os.path.join(HERE, 'out', 'score.lock')

def acquire(label='complete rubric', path=DEFAULT_PATH):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    stream = open(path, 'a+')
    try:
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        stream.seek(0)
        detail = stream.read().strip()
        stream.close()
        print('A complete rubric run is already active' + (': ' + detail if detail else '.'))
        return None
    stream.seek(0)
    stream.truncate()
    json.dump({'pid': os.getpid(), 'startedAt': time.time(), 'label': label}, stream)
    stream.write('\n')
    stream.flush()
    return stream

def release(stream):
    if stream is None:
        return
    fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
    stream.close()
