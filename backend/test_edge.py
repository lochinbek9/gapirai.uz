import asyncio
import edge_tts

async def main():
    text = "Menga bir daqiqadan kam vaqt bering, men rad etili..."
    voice = "uz-UZ-MadinaNeural"
    communicate = edge_tts.Communicate(text, voice, rate="-8%", pitch="-2Hz")
    await communicate.save("test.mp3")
    print("Success")

asyncio.run(main())
