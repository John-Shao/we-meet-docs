from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0035_user_meet_profile_synced_at")]

    operations = [
        migrations.AlterField(
            model_name="documentchatshare",
            name="role",
            field=models.CharField(
                max_length=20,
                choices=[
                    ("reader", "Reader"),
                    ("commenter", "Commenter"),
                    ("editor", "Editor"),
                ],
            ),
        ),
    ]
