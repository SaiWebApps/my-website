"""Copy one explicit committed src/data tree into scratch so Node can load the real modules."""
import argparse, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

def export(dest, revision):
    os.makedirs(dest, exist_ok=True)
    names = subprocess.run(['git', '-C', ROOT, 'ls-tree', '--name-only', revision, 'src/data/'], capture_output=True, text=True, check=True).stdout.split()
    for n in names:
        data = subprocess.run(['git', '-C', ROOT, 'show', f'{revision}:{n}'], capture_output=True, check=True).stdout
        with open(os.path.join(dest, os.path.basename(n)), 'wb') as f:
            f.write(data)
    return [os.path.basename(n) for n in names]

def main(argv=None):
    parser = argparse.ArgumentParser(description='Export one explicit Git revision of src/data.')
    parser.add_argument('--out-dir', required=True)
    parser.add_argument('--revision', required=True)
    args = parser.parse_args(argv)
    print(export(os.path.abspath(args.out_dir), args.revision))


if __name__ == '__main__':
    main()
