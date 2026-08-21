from cryptography.fernet import Fernet

# Generate a secure 32-byte key base64-encoded
encryption_key = Fernet.generate_key()
print(f"Encryption Key: {encryption_key.decode()}")
