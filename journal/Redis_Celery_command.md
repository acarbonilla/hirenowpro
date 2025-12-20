.\redis-server.exe

cd C:\Users\dc\PycharmProjects\hirenowpro\backend

$env:PYTHONPATH="C:\Users\dc\PycharmProjects\hirenowpro\backend"
$env:DJANGO_SETTINGS_MODULE="core.settings"

python -m celery -A core.celery worker -l info -P solo -E