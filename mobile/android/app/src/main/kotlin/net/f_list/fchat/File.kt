package net.f_list.fchat

import android.content.Context
import android.webkit.JavascriptInterface
import org.json.JSONArray
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class File(private val ctx: Context) {
	@JavascriptInterface
	fun readFile(name: String, s: Long, l: Int): String? {
		val file = File(ctx.filesDir, name)
		if(!file.exists()) return null
		FileInputStream(file).use { fs ->
			val start = if(s != -1L) s else 0
			fs.channel.position(start)
			val maxLength = fs.channel.size() - start
			val length = if(l != -1 && l < maxLength) l else maxLength.toInt()
			val bytes = ByteArray(length)
			fs.read(bytes, 0, length)
			return String(bytes)
		}
	}

	@JavascriptInterface
	fun readFile(name: String): String? {
		return readFile(name, -1, -1)
	}

	@JavascriptInterface
	fun getSize(name: String) = File(ctx.filesDir, name).length()

	@JavascriptInterface
	fun writeFile(name: String, data: String) {
		FileOutputStream(File(ctx.filesDir, name)).use { it.write(data.toByteArray()) }
	}

	@JavascriptInterface
	fun append(name: String, data: String) {
		FileOutputStream(File(ctx.filesDir, name), true).use { it.write(data.toByteArray()) }
	}

	@JavascriptInterface
	fun listFiles(name: String) = JSONArray(File(ctx.filesDir, name).listFiles().filter { it.isFile }.map { it.name }).toString()

	@JavascriptInterface
	fun listDirectories(name: String) = JSONArray(File(ctx.filesDir, name).listFiles().filter { it.isDirectory }.map { it.name }).toString()

	@JavascriptInterface
	fun ensureDirectory(name: String) {
		File(ctx.filesDir, name).mkdirs()
	}
}