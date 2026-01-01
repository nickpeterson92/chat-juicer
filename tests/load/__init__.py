"""Load testing module for Chat Juicer.

Run tests with:
    TARGET_HOST=http://your-ec2:8000 pytest tests/load/ -v --no-cov

Or use Locust:
    locust -f tests/load/locustfile.py --host=http://your-ec2:8000
"""
