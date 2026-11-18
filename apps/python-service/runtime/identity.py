import os
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4

identity = {
    'protocolVersion': 1, 'serviceType': 'python', 'serviceVersion': '1.0.0',
    'deploymentId': os.environ.get('HUMAN_DEPLOYMENT_ID', str(Path(__file__).resolve().parents[3])),
    'instanceId': str(uuid4()), 'startedAt': datetime.now(timezone.utc).isoformat(), 'pid': os.getpid(),
}
