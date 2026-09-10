#!/usr/bin/env python3
"""Read-only verification of all manifest assets, hashes and USDZ archive integrity."""
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
import zipfile

root = Path(sys.argv[1] if len(sys.argv) > 1 else '/private/tmp/astra-ar-assets')
manifest = json.loads((root / 'manifest.json').read_text())
assert manifest['count'] == manifest['catalogWorks'] == len(manifest['entries']) == 358
assert len({entry['id'] for entry in manifest['entries']}) == 358
total = 0
for entry in manifest['entries']:
    for kind in ('glb', 'usdz'):
        item = entry[kind]
        binary = (root / item['file']).read_bytes()
        assert len(binary) == item['bytes']
        assert hashlib.sha256(binary).hexdigest() == item['sha256']
        total += len(binary)
        if kind == 'glb':
            magic, version, size = struct.unpack_from('<III', binary)
            assert (magic, version, size) == (0x46546c67, 2, len(binary))
            length, chunk_type = struct.unpack_from('<II', binary, 12)
            assert chunk_type == 0x4e4f534a
            model = json.loads(binary[20:20+length])
            assert len(model['meshes']) == 6
            assert len(model['materials']) == 3
            assert len(model['images']) == 1
            assert model['images'][0]['mimeType'] == 'image/jpeg'
            assert 'uri' not in model['images'][0]
            assert all('uri' not in value for value in model['buffers'])
        else:
            with zipfile.ZipFile(root / item['file']) as archive:
                assert archive.testzip() is None
                assert archive.namelist()[0] == 'model.usda'
                for info in archive.infolist():
                    assert info.compress_type == zipfile.ZIP_STORED
                    assert info.date_time == (1980, 1, 1, 0, 0, 0)
                    name_length, extra_length = struct.unpack_from('<HH', binary, info.header_offset + 26)
                    assert (info.header_offset + 30 + name_length + extra_length) % 64 == 0
                model = archive.read('model.usda').decode()
                assert 'metersPerUnit = 1' in model
                assert 'preliminary:anchoring:type = "plane"' in model
                assert 'preliminary:planeAnchoring:alignment = "vertical"' in model
                assert 'VerticalWallOrientation' in model
                for resource in re.findall(r'@([^@]+)@', model):
                    assert resource.removeprefix('./') in archive.namelist()
                images = [name for name in archive.namelist() if name.endswith(('.jpg', '.png'))]
                assert len(images) == 1 and images[0].endswith('.jpg')
    assert max(entry['textureWidth'], entry['textureHeight']) <= 1024
    assert max(entry['imageWidthMeters'], entry['imageHeightMeters']) == 1
    assert entry['depthMeters'] == .03
assert total == manifest['totalBytes']
report = {
    'works': manifest['count'],
    'assets': len(manifest['entries']) * 2,
    'bytes': total,
    'checks': ['file counts', 'SHA-256 hashes', 'GLB v2 structure', 'embedded JPEG',
               '6 meshes / 3 materials', 'USDZ ZIP CRCs', 'uncompressed ZIP',
               '64-byte file alignment', 'deterministic ZIP timestamps',
               'internal USDZ references', 'meter units', 'vertical plane anchoring'],
    'physicalDeviceVerified': False,
}
(root / 'qa' / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
