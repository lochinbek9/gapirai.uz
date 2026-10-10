import asyncio
import edge_tts

async def main():
    text = "Siz birinchi navbatda eʼtiborsiz tanlanmaysiz...."
    voice = "uz-UZ-MadinaNeural"
    communicate = edge_tts.Communicate(text, voice, rate="-8%", pitch="-2Hz")
    await communicate.save("test2.mp3")
    print("Success")

asyncio.run(main())
