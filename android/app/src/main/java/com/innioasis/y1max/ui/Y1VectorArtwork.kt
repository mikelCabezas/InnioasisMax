package com.innioasis.y1max.ui

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import kotlin.math.cos
import kotlin.math.sin

/**
 * Hardware-accelerated procedural vector artwork for Innioasis Y1 Max (Android API 17+).
 * Zero external dependencies, zero bitmap allocations, and pre-allocated geometry primitives
 * for smooth 60fps rendering on the MTK6739 framebuffer.
 */
object Y1VectorArtwork {

    private val rect = RectF()
    private val ovalRect = RectF()
    private val path = Path()
    private val sheenPath = Path()

    private const val SPOTIFY_GREEN_TOP = 0xFF24D460.toInt()
    private const val SPOTIFY_GREEN_MAIN = 0xFF1DB954.toInt()
    private const val SPOTIFY_GREEN_BOTTOM = 0xFF159642.toInt()
    private const val SPOTIFY_WAVE_DARK = 0xFF111315.toInt()

    private const val APPLE_MUSIC_TOP = 0xFFFF5E7E.toInt()
    private const val APPLE_MUSIC_BOTTOM = 0xFFFA243C.toInt()

    private const val VINYL_BG_TOP = 0xFF222631.toInt()
    private const val VINYL_BG_BOTTOM = 0xFF12141B.toInt()
    private const val VINYL_DISC_COLOR = 0xFF181A20.toInt()
    private const val VINYL_RIM_COLOR = 0xFF2A2E39.toInt()
    private const val VINYL_GROOVE_LIGHT = 0xFF262A34.toInt()
    private const val VINYL_GROOVE_DARK = 0xFF111318.toInt()
    private const val VINYL_SPINDLE_HOLE = 0xFF0D0E12.toInt()

    /**
     * Draws the official-style Spotify green circle (#1DB954) with subtle depth highlight
     * and the 3 iconic curved acoustic wave arcs inside (thickest on top, medium in middle,
     * thinnest on bottom, tilted slightly upward-right).
     */
    fun drawSpotifyLogo(canvas: Canvas, cx: Float, cy: Float, radius: Float, paint: Paint) {
        if (radius <= 0f) return

        val prevStyle = paint.style
        val prevCap = paint.strokeCap
        val prevJoin = paint.strokeJoin
        val prevStrokeWidth = paint.strokeWidth
        val prevColor = paint.color
        val prevShader = paint.shader

        // 1. Subtle drop shadow
        paint.shader = null
        paint.style = Paint.Style.FILL
        paint.color = 0x44000000
        canvas.drawCircle(cx, cy + radius * 0.06f, radius * 0.98f, paint)

        // 2. Main Spotify green circle with subtle vertical lighting gradient
        paint.color = Color.WHITE
        paint.shader = LinearGradient(
            cx - radius * 0.3f,
            cy - radius,
            cx + radius * 0.3f,
            cy + radius,
            intArrayOf(SPOTIFY_GREEN_TOP, SPOTIFY_GREEN_MAIN, SPOTIFY_GREEN_BOTTOM),
            floatArrayOf(0f, 0.55f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawCircle(cx, cy, radius, paint)
        paint.shader = null

        // 3. Subtle specular rim highlight
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = (radius * 0.045f).coerceAtLeast(1f)
        paint.color = 0x33FFFFFF
        canvas.drawCircle(cx, cy, radius - paint.strokeWidth * 0.5f, paint)

        // 4. Three iconic curved acoustic wave arcs tilted slightly upward-right
        val saveCount = canvas.save()
        canvas.rotate(-9f, cx, cy)

        paint.style = Paint.Style.STROKE
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND
        paint.color = SPOTIFY_WAVE_DARK

        // Top wave (widest & thickest)
        paint.strokeWidth = (radius * 0.165f).coerceAtLeast(1.8f)
        path.reset()
        path.moveTo(cx - radius * 0.54f, cy - radius * 0.19f)
        path.quadTo(cx, cy - radius * 0.42f, cx + radius * 0.54f, cy - radius * 0.16f)
        canvas.drawPath(path, paint)

        // Middle wave (medium width & thickness)
        paint.strokeWidth = (radius * 0.135f).coerceAtLeast(1.5f)
        path.reset()
        path.moveTo(cx - radius * 0.45f, cy + radius * 0.09f)
        path.quadTo(cx, cy - radius * 0.10f, cx + radius * 0.45f, cy + radius * 0.12f)
        canvas.drawPath(path, paint)

        // Bottom wave (narrowest & thinnest)
        paint.strokeWidth = (radius * 0.108f).coerceAtLeast(1.2f)
        path.reset()
        path.moveTo(cx - radius * 0.34f, cy + radius * 0.35f)
        path.quadTo(cx, cy + radius * 0.20f, cx + radius * 0.35f, cy + radius * 0.38f)
        canvas.drawPath(path, paint)

        canvas.restoreToCount(saveCount)

        paint.style = prevStyle
        paint.strokeCap = prevCap
        paint.strokeJoin = prevJoin
        paint.strokeWidth = prevStrokeWidth
        paint.color = prevColor
        paint.shader = prevShader
    }

    /**
     * Draws the iconic Apple Music rounded-rect icon (LinearGradient from #FF5E7E top to
     * #FA243C bottom) and a crisp white beamed double eighth-note (♫) inside.
     */
    fun drawAppleMusicLogo(canvas: Canvas, left: Float, top: Float, size: Float, paint: Paint) {
        if (size <= 0f) return

        val prevStyle = paint.style
        val prevCap = paint.strokeCap
        val prevJoin = paint.strokeJoin
        val prevStrokeWidth = paint.strokeWidth
        val prevColor = paint.color
        val prevShader = paint.shader

        val right = left + size
        val bottom = top + size
        val cornerRadius = size * 0.225f

        // 1. Subtle drop shadow
        paint.shader = null
        paint.style = Paint.Style.FILL
        paint.color = 0x3A000000
        rect.set(left, top + size * 0.03f, right, bottom + size * 0.03f)
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, paint)

        // 2. Apple Music gradient rounded-rect background (#FF5E7E -> #FA243C)
        rect.set(left, top, right, bottom)
        paint.color = Color.WHITE
        paint.shader = LinearGradient(
            left,
            top,
            left,
            bottom,
            APPLE_MUSIC_TOP,
            APPLE_MUSIC_BOTTOM,
            Shader.TileMode.CLAMP
        )
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, paint)
        paint.shader = null

        // 3. Subtle inner border highlight
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = (size * 0.025f).coerceAtLeast(1f)
        paint.color = 0x2EFFFFFF
        val inset = paint.strokeWidth * 0.5f
        rect.set(left + inset, top + inset, right - inset, bottom - inset)
        canvas.drawRoundRect(rect, cornerRadius - inset, cornerRadius - inset, paint)

        // 4. Crisp white beamed double eighth-note (♫)
        paint.style = Paint.Style.FILL
        paint.color = Color.WHITE

        // Notehead dimensions & centers
        val headRx = size * 0.115f
        val headRy = size * 0.084f
        val leftHeadCx = left + size * 0.335f
        val leftHeadCy = top + size * 0.725f
        val rightHeadCx = left + size * 0.675f
        val rightHeadCy = top + size * 0.655f

        // Left tilted elliptical notehead
        var saveCount = canvas.save()
        canvas.translate(leftHeadCx, leftHeadCy)
        canvas.rotate(-24f)
        ovalRect.set(-headRx, -headRy, headRx, headRy)
        canvas.drawOval(ovalRect, paint)
        canvas.restoreToCount(saveCount)

        // Right tilted elliptical notehead
        saveCount = canvas.save()
        canvas.translate(rightHeadCx, rightHeadCy)
        canvas.rotate(-24f)
        ovalRect.set(-headRx, -headRy, headRx, headRy)
        canvas.drawOval(ovalRect, paint)
        canvas.restoreToCount(saveCount)

        // Vertical stems rising from the right side of each notehead
        val stemWidth = (size * 0.068f).coerceAtLeast(1.8f)
        val leftStemRight = leftHeadCx + headRx * 0.92f
        val leftStemLeft = leftStemRight - stemWidth
        val leftStemTop = top + size * 0.275f
        val leftStemBottom = leftHeadCy - headRy * 0.10f

        val rightStemRight = rightHeadCx + headRx * 0.92f
        val rightStemLeft = rightStemRight - stemWidth
        val rightStemTop = top + size * 0.205f
        val rightStemBottom = rightHeadCy - headRy * 0.10f

        rect.set(leftStemLeft, leftStemTop, leftStemRight, leftStemBottom)
        canvas.drawRect(rect, paint)

        rect.set(rightStemLeft, rightStemTop, rightStemRight, rightStemBottom)
        canvas.drawRect(rect, paint)

        // Slanted thick top beam connecting the two stems
        val beamThickness = size * 0.125f
        path.reset()
        path.moveTo(leftStemLeft, leftStemTop)
        path.lineTo(rightStemRight, rightStemTop)
        path.lineTo(rightStemRight, rightStemTop + beamThickness)
        path.lineTo(leftStemLeft, leftStemTop + beamThickness)
        path.close()
        canvas.drawPath(path, paint)

        paint.style = prevStyle
        paint.strokeCap = prevCap
        paint.strokeJoin = prevJoin
        paint.strokeWidth = prevStrokeWidth
        paint.color = prevColor
        paint.shader = prevShader
    }

    /**
     * Draws a sleek dark sleeve + vinyl record disc (#181A20) with concentric groove rings,
     * diagonal vinyl light sheen, a colored center label (accentColor), and a center spindle hole.
     * Used whenever an album or song has no embedded cover art.
     */
    fun drawDefaultVinylCover(
        canvas: Canvas,
        left: Float,
        top: Float,
        size: Float,
        accentColor: Int,
        title: String,
        paint: Paint,
        textPaint: Paint
    ) {
        if (size <= 0f) return

        val prevStyle = paint.style
        val prevCap = paint.strokeCap
        val prevJoin = paint.strokeJoin
        val prevStrokeWidth = paint.strokeWidth
        val prevColor = paint.color
        val prevShader = paint.shader

        val right = left + size
        val bottom = top + size
        val cx = left + size * 0.5f
        val cy = top + size * 0.5f
        val cornerRadius = size * 0.12f

        // 1. Dark album sleeve background with subtle metallic gradient
        rect.set(left, top, right, bottom)
        paint.style = Paint.Style.FILL
        paint.color = Color.WHITE
        paint.shader = LinearGradient(
            left,
            top,
            right,
            bottom,
            VINYL_BG_TOP,
            VINYL_BG_BOTTOM,
            Shader.TileMode.CLAMP
        )
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, paint)
        paint.shader = null

        // Subtle accent ambient glow behind the vinyl disc
        val glowColor = (accentColor and 0x00FFFFFF) or 0x26000000
        paint.color = Color.WHITE
        paint.shader = RadialGradient(
            cx,
            cy,
            size * 0.48f,
            glowColor,
            0x00000000,
            Shader.TileMode.CLAMP
        )
        canvas.drawCircle(cx, cy, size * 0.48f, paint)
        paint.shader = null

        // 2. Main vinyl record disc (#181A20)
        val discRadius = size * 0.42f
        paint.style = Paint.Style.FILL
        paint.color = VINYL_DISC_COLOR
        canvas.drawCircle(cx, cy, discRadius, paint)

        // Outer vinyl bevel rim
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = (size * 0.015f).coerceAtLeast(1f)
        paint.color = VINYL_RIM_COLOR
        canvas.drawCircle(cx, cy, discRadius, paint)

        // 3. Diagonal vinyl light sheen (two opposite specular reflection wedges)
        val saveCount = canvas.save()
        paint.style = Paint.Style.FILL
        paint.color = 0x16FFFFFF
        ovalRect.set(cx - discRadius, cy - discRadius, cx + discRadius, cy + discRadius)
        sheenPath.reset()
        sheenPath.moveTo(cx, cy)
        sheenPath.arcTo(ovalRect, -58f, 28f)
        sheenPath.close()
        canvas.drawPath(sheenPath, paint)

        sheenPath.reset()
        sheenPath.moveTo(cx, cy)
        sheenPath.arcTo(ovalRect, 122f, 28f)
        sheenPath.close()
        canvas.drawPath(sheenPath, paint)
        canvas.restoreToCount(saveCount)

        // 4. Concentric micro-groove rings
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = (size * 0.008f).coerceAtLeast(0.8f)
        val grooveFractions = floatArrayOf(0.88f, 0.78f, 0.68f, 0.58f, 0.49f)
        for (i in grooveFractions.indices) {
            paint.color = if (i % 2 == 0) VINYL_GROOVE_LIGHT else VINYL_GROOVE_DARK
            canvas.drawCircle(cx, cy, discRadius * grooveFractions[i], paint)
        }

        // 5. Colored center label (accentColor)
        val labelRadius = discRadius * 0.36f
        paint.style = Paint.Style.FILL
        paint.color = accentColor
        canvas.drawCircle(cx, cy, labelRadius, paint)

        // Subtle inner ring on the center label
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = (size * 0.01f).coerceAtLeast(0.8f)
        paint.color = 0x40FFFFFF
        canvas.drawCircle(cx, cy, labelRadius * 0.80f, paint)

        // Optional clean monogram initial on the upper label arc if space permits and title is present
        val trimmed = title.trim()
        if (trimmed.isNotEmpty() && size >= 56f) {
            val prevTextSize = textPaint.textSize
            val prevTextAlign = textPaint.textAlign
            val prevTextColor = textPaint.color
            textPaint.textSize = (labelRadius * 0.52f).coerceAtLeast(7f)
            textPaint.textAlign = Paint.Align.CENTER
            textPaint.color = 0xCCFFFFFF.toInt()
            val initial = trimmed.substring(0, 1).uppercase()
            canvas.drawText(initial, cx, cy - labelRadius * 0.34f, textPaint)
            textPaint.textSize = prevTextSize
            textPaint.textAlign = prevTextAlign
            textPaint.color = prevTextColor
        }

        // 6. Center spindle hole
        val holeRadius = (discRadius * 0.085f).coerceAtLeast(1.8f)
        paint.style = Paint.Style.FILL
        paint.color = VINYL_SPINDLE_HOLE
        canvas.drawCircle(cx, cy, holeRadius, paint)

        paint.style = Paint.Style.STROKE
        paint.strokeWidth = (size * 0.008f).coerceAtLeast(0.8f)
        paint.color = 0x55FFFFFF
        canvas.drawCircle(cx, cy, holeRadius, paint)

        // 7. Outer sleeve border
        rect.set(left + 0.5f, top + 0.5f, right - 0.5f, bottom - 0.5f)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1f
        paint.color = 0x28FFFFFF
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, paint)

        paint.style = prevStyle
        paint.strokeCap = prevCap
        paint.strokeJoin = prevJoin
        paint.strokeWidth = prevStrokeWidth
        paint.color = prevColor
        paint.shader = prevShader
    }

    private const val STATUS_ACTIVE_BLUE = 0xFF1D6FE8.toInt()
    private const val STATUS_DISABLED_SLATE = 0xFF8A94A6.toInt()
    private const val STATUS_ALERT_RED = 0xFFD9383A.toInt()

    /**
     * Draws a crisp rotating circular sync indicator (two curved arrows chasing each other
     * in a circle, rotated by angleDeg) for the top StatusBar when the microSD card is being indexed.
     */
    fun drawSpinningSyncIcon(
        canvas: Canvas,
        cx: Float,
        cy: Float,
        radius: Float,
        angleDeg: Float,
        color: Int,
        paint: Paint
    ) {
        if (radius <= 0f) return

        val prevStyle = paint.style
        val prevCap = paint.strokeCap
        val prevJoin = paint.strokeJoin
        val prevStrokeWidth = paint.strokeWidth
        val prevColor = paint.color
        val prevShader = paint.shader

        val saveCount = canvas.save()
        canvas.rotate(angleDeg, cx, cy)

        val strokeW = (radius * 0.26f).coerceAtLeast(1.4f)
        val arcRadius = radius * 0.78f
        ovalRect.set(cx - arcRadius, cy - arcRadius, cx + arcRadius, cy + arcRadius)

        paint.shader = null
        paint.color = color
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = strokeW
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND

        // Draw two 125-degree curved arcs separated by gaps
        val startAngles = floatArrayOf(-70f, 110f)
        val sweepAngle = 122f
        val headLength = (radius * 0.46f).coerceAtLeast(2.2f)

        for (i in startAngles.indices) {
            val startDeg = startAngles[i]
            canvas.drawArc(ovalRect, startDeg, sweepAngle, false, paint)

            // Compute arrow tip at the end of each clockwise arc
            val endDeg = startDeg + sweepAngle
            val endRad = Math.toRadians(endDeg.toDouble())
            val tipX = cx + arcRadius * cos(endRad).toFloat()
            val tipY = cy + arcRadius * sin(endRad).toFloat()

            // Tangent angle for clockwise motion is endDeg + 90 degrees;
            // arrowhead wings point backward along the tangent (+/- 34 degrees from back-tangent)
            val backTangentDeg = endDeg - 90f
            val wingAngle1 = Math.toRadians((backTangentDeg - 36f).toDouble())
            val wingAngle2 = Math.toRadians((backTangentDeg + 32f).toDouble())

            path.reset()
            path.moveTo(
                tipX + headLength * cos(wingAngle1).toFloat(),
                tipY + headLength * sin(wingAngle1).toFloat()
            )
            path.lineTo(tipX, tipY)
            path.lineTo(
                tipX + headLength * cos(wingAngle2).toFloat(),
                tipY + headLength * sin(wingAngle2).toFloat()
            )
            canvas.drawPath(path, paint)
        }

        canvas.restoreToCount(saveCount)

        paint.style = prevStyle
        paint.strokeCap = prevCap
        paint.strokeJoin = prevJoin
        paint.strokeWidth = prevStrokeWidth
        paint.color = prevColor
        paint.shader = prevShader
    }

    /**
     * Draws the iconic Bluetooth rune (ᛒ) centered at (cx, cy) within radius.
     * When enabled == true, drawn in #1D6FE8 (vibrant blue).
     * When enabled == false, drawn in #8A94A6 (muted slate grey) with a crisp
     * diagonal crimson strike-through slash (#D9383A) and white halo backing line.
     */
    fun drawBluetoothIcon(
        canvas: Canvas,
        cx: Float,
        cy: Float,
        radius: Float,
        enabled: Boolean,
        paint: Paint
    ) {
        if (radius <= 0f) return

        val prevStyle = paint.style
        val prevCap = paint.strokeCap
        val prevJoin = paint.strokeJoin
        val prevStrokeWidth = paint.strokeWidth
        val prevColor = paint.color
        val prevShader = paint.shader

        val strokeW = (radius * 0.22f).coerceAtLeast(1.4f)
        paint.shader = null
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = strokeW
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND
        paint.color = if (enabled) STATUS_ACTIVE_BLUE else STATUS_DISABLED_SLATE

        // Vertical spine from cy - radius to cy + radius
        canvas.drawLine(cx, cy - radius, cx, cy + radius, paint)

        // Upper right triangle -> crossing down-left
        path.reset()
        path.moveTo(cx, cy - radius)
        path.lineTo(cx + radius * 0.68f, cy - radius * 0.45f)
        path.lineTo(cx - radius * 0.55f, cy + radius * 0.45f)
        canvas.drawPath(path, paint)

        // Lower right triangle -> crossing up-left
        path.reset()
        path.moveTo(cx, cy + radius)
        path.lineTo(cx + radius * 0.68f, cy + radius * 0.45f)
        path.lineTo(cx - radius * 0.55f, cy - radius * 0.45f)
        canvas.drawPath(path, paint)

        // Diagonal strike-through slash (\) when Bluetooth is OFF
        if (!enabled) {
            val x1 = cx - radius * 0.95f
            val y1 = cy - radius * 0.95f
            val x2 = cx + radius * 0.95f
            val y2 = cy + radius * 0.95f

            // White halo/backing line for unmistakable contrast
            paint.color = 0xE6FFFFFF.toInt()
            paint.strokeWidth = strokeW + (radius * 0.22f).coerceAtLeast(1.4f)
            canvas.drawLine(x1, y1, x2, y2, paint)

            // Crisp crimson red strike-through slash
            paint.color = STATUS_ALERT_RED
            paint.strokeWidth = (radius * 0.24f).coerceAtLeast(1.5f)
            canvas.drawLine(x1, y1, x2, y2, paint)
        }

        paint.style = prevStyle
        paint.strokeCap = prevCap
        paint.strokeJoin = prevJoin
        paint.strokeWidth = prevStrokeWidth
        paint.color = prevColor
        paint.shader = prevShader
    }

    /**
     * Draws the iconic Wi-Fi signal icon: a bottom focal dot at (cx, cy + radius * 0.65f)
     * and 3 concentric upward signal arcs (startAngle = -135f, sweepAngle = 90f).
     * When enabled == true, drawn in #1D6FE8 (vibrant blue).
     * When enabled == false, drawn in #8A94A6 (muted slate grey) with a crisp
     * diagonal crimson strike-through slash (#D9383A) and white halo backing line.
     */
    fun drawWifiIcon(
        canvas: Canvas,
        cx: Float,
        cy: Float,
        radius: Float,
        enabled: Boolean,
        paint: Paint
    ) {
        if (radius <= 0f) return

        val prevStyle = paint.style
        val prevCap = paint.strokeCap
        val prevJoin = paint.strokeJoin
        val prevStrokeWidth = paint.strokeWidth
        val prevColor = paint.color
        val prevShader = paint.shader

        val iconColor = if (enabled) STATUS_ACTIVE_BLUE else STATUS_DISABLED_SLATE
        val focalX = cx
        val focalY = cy + radius * 0.65f
        val strokeW = (radius * 0.21f).coerceAtLeast(1.3f)

        paint.shader = null
        paint.color = iconColor

        // 1. Bottom focal dot
        paint.style = Paint.Style.FILL
        val dotRadius = (radius * 0.20f).coerceAtLeast(1.2f)
        canvas.drawCircle(focalX, focalY, dotRadius, paint)

        // 2. Three concentric upward signal arcs centered around the focal dot
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = strokeW
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND

        val arcRadii = floatArrayOf(radius * 0.56f, radius * 0.98f, radius * 1.40f)
        for (i in arcRadii.indices) {
            val r = arcRadii[i]
            ovalRect.set(focalX - r, focalY - r, focalX + r, focalY + r)
            canvas.drawArc(ovalRect, -135f, 90f, false, paint)
        }

        // 3. Diagonal strike-through slash (\) when Wi-Fi is OFF
        if (!enabled) {
            val x1 = cx - radius * 0.95f
            val y1 = cy - radius * 0.90f
            val x2 = cx + radius * 0.95f
            val y2 = cy + radius * 0.95f

            // White halo/backing line for unmistakable contrast
            paint.color = 0xE6FFFFFF.toInt()
            paint.strokeWidth = strokeW + (radius * 0.22f).coerceAtLeast(1.4f)
            canvas.drawLine(x1, y1, x2, y2, paint)

            // Crisp crimson red strike-through slash
            paint.color = STATUS_ALERT_RED
            paint.strokeWidth = (radius * 0.24f).coerceAtLeast(1.5f)
            canvas.drawLine(x1, y1, x2, y2, paint)
        }

        paint.style = prevStyle
        paint.strokeCap = prevCap
        paint.strokeJoin = prevJoin
        paint.strokeWidth = prevStrokeWidth
        paint.color = prevColor
        paint.shader = prevShader
    }

    /**
     * Draws a crisp iPod-style closed Padlock icon (rounded rectangular lock body at bottom +
     * U-shaped shackle arch on top + tiny keyhole dot) in #D9383A for the top StatusBar
     * when Keypad Lock (Hold) is active.
     */
    fun drawPadlockIcon(
        canvas: Canvas,
        cx: Float,
        cy: Float,
        radius: Float,
        paint: Paint
    ) {
        if (radius <= 0f) return

        val prevStyle = paint.style
        val prevCap = paint.strokeCap
        val prevJoin = paint.strokeJoin
        val prevStrokeWidth = paint.strokeWidth
        val prevColor = paint.color
        val prevShader = paint.shader

        paint.shader = null
        val shackleStroke = (radius * 0.24f).coerceAtLeast(1.4f)

        // 1. U-shaped shackle arch on top
        val shackleHalfW = radius * 0.46f
        val shackleTop = cy - radius * 0.92f
        val shackleArcBottom = shackleTop + shackleHalfW * 2f
        val shackleLegBottom = cy + radius * 0.05f

        paint.style = Paint.Style.STROKE
        paint.strokeWidth = shackleStroke
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND
        paint.color = STATUS_ALERT_RED

        path.reset()
        path.moveTo(cx - shackleHalfW, shackleLegBottom)
        path.lineTo(cx - shackleHalfW, shackleTop + shackleHalfW)
        ovalRect.set(cx - shackleHalfW, shackleTop, cx + shackleHalfW, shackleArcBottom)
        path.arcTo(ovalRect, 180f, 180f)
        path.lineTo(cx + shackleHalfW, shackleLegBottom)
        canvas.drawPath(path, paint)

        // 2. Rounded rectangular lock body at bottom
        val bodyHalfW = radius * 0.76f
        val bodyTop = cy - radius * 0.10f
        val bodyBottom = cy + radius * 0.95f
        val bodyCorner = (radius * 0.22f).coerceAtLeast(1.2f)

        paint.style = Paint.Style.FILL
        paint.color = STATUS_ALERT_RED
        rect.set(cx - bodyHalfW, bodyTop, cx + bodyHalfW, bodyBottom)
        canvas.drawRoundRect(rect, bodyCorner, bodyCorner, paint)

        // 3. Tiny white keyhole dot & slot inside the lock body
        val keyholeCy = (bodyTop + bodyBottom) * 0.5f - radius * 0.05f
        val keyholeRadius = (radius * 0.16f).coerceAtLeast(1.0f)
        paint.color = Color.WHITE
        canvas.drawCircle(cx, keyholeCy, keyholeRadius, paint)

        paint.style = Paint.Style.STROKE
        paint.strokeWidth = (radius * 0.16f).coerceAtLeast(1.0f)
        paint.strokeCap = Paint.Cap.ROUND
        canvas.drawLine(cx, keyholeCy, cx, keyholeCy + radius * 0.25f, paint)

        paint.style = prevStyle
        paint.strokeCap = prevCap
        paint.strokeJoin = prevJoin
        paint.strokeWidth = prevStrokeWidth
        paint.color = prevColor
        paint.shader = prevShader
    }

    /**
     * Draws a crisp Speaker icon (speaker trapezoid cone on the left + 1, 2, or 3 sound wave
     * arcs on the right depending on volumePercent, or a small 'x' mute slash when volumePercent == 0)
     * for the Volume Bar at the bottom of the Now Playing screen.
     */
    fun drawSpeakerIcon(
        canvas: Canvas,
        cx: Float,
        cy: Float,
        radius: Float,
        volumePercent: Int,
        activeColor: Int,
        paint: Paint
    ) {
        if (radius <= 0f) return

        val prevStyle = paint.style
        val prevCap = paint.strokeCap
        val prevJoin = paint.strokeJoin
        val prevStrokeWidth = paint.strokeWidth
        val prevColor = paint.color
        val prevShader = paint.shader

        val clampedVol = volumePercent.coerceIn(0, 100)
        paint.shader = null

        // 1. Speaker baffle + trapezoid cone on the left
        val coneLeft = cx - radius * 0.92f
        val coneMidX = cx - radius * 0.52f
        val coneRight = cx - radius * 0.05f
        val baffleHalfH = radius * 0.34f
        val coneHalfH = radius * 0.78f

        path.reset()
        path.moveTo(coneLeft, cy - baffleHalfH)
        path.lineTo(coneMidX, cy - baffleHalfH)
        path.lineTo(coneRight, cy - coneHalfH)
        path.lineTo(coneRight, cy + coneHalfH)
        path.lineTo(coneMidX, cy + baffleHalfH)
        path.lineTo(coneLeft, cy + baffleHalfH)
        path.close()

        paint.style = Paint.Style.FILL
        paint.color = if (clampedVol > 0) activeColor else STATUS_DISABLED_SLATE
        canvas.drawPath(path, paint)

        // 2. Right side: mute 'x' when volumePercent == 0, or 1..3 sound wave arcs
        val strokeW = (radius * 0.20f).coerceAtLeast(1.3f)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = strokeW
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND

        if (clampedVol == 0) {
            paint.color = STATUS_ALERT_RED
            val muteCx = cx + radius * 0.48f
            val muteHalf = radius * 0.34f
            canvas.drawLine(muteCx - muteHalf, cy - muteHalf, muteCx + muteHalf, cy + muteHalf, paint)
            canvas.drawLine(muteCx + muteHalf, cy - muteHalf, muteCx - muteHalf, cy + muteHalf, paint)
        } else {
            paint.color = activeColor
            val waveOriginX = coneRight - radius * 0.06f
            val waveCount = when {
                clampedVol < 34 -> 1
                clampedVol < 67 -> 2
                else -> 3
            }
            val waveRadii = floatArrayOf(radius * 0.36f, radius * 0.66f, radius * 0.96f)
            for (i in 0 until waveCount) {
                val r = waveRadii[i]
                ovalRect.set(waveOriginX - r, cy - r, waveOriginX + r, cy + r)
                canvas.drawArc(ovalRect, -42f, 84f, false, paint)
            }
        }

        paint.style = prevStyle
        paint.strokeCap = prevCap
        paint.strokeJoin = prevJoin
        paint.strokeWidth = prevStrokeWidth
        paint.color = prevColor
        paint.shader = prevShader
    }
}
