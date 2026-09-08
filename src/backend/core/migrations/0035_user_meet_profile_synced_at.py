from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0034_document_chat_permissions")]
    operations = [
        migrations.AddField(
            model_name="user",
            name="meet_profile_synced_at",
            field=models.DateTimeField(null=True, blank=True, editable=False),
        ),
    ]
