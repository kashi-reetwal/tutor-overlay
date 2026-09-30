use image::{imageops::FilterType, DynamicImage, ImageFormat, RgbaImage};
use log::{error, info, warn};
use std::io::Cursor;

pub struct CapturedImage {
    pub base64: String,
    pub width: u32,
    pub height: u32,
    pub is_fallback: bool,
}

/// Capture the active window if possible, falling back to the entire screen.
pub fn capture_active_or_fullscreen() -> Result<CapturedImage, String> {
    #[cfg(target_os = "windows")]
    {
        match capture_active_window_windows() {
            Ok(img) => {
                info!("Captured active window successfully ({}x{})", img.width(), img.height());
                let processed = process_image(img, false)?;
                Ok(processed)
            }
            Err(e) => {
                warn!("Active window capture failed: {}. Falling back to full screen.", e);
                let img = capture_fullscreen_windows()?;
                info!("Captured full screen fallback ({}x{})", img.width(), img.height());
                let processed = process_image(img, true)?;
                Ok(processed)
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Mock capture placeholder for development on non-Windows targets
        warn!("Native capture only supported on Windows. Generating test frame.");
        let img = RgbaImage::new(800, 600);
        process_image(img, true)
    }
}

/// Process image: downscale to max 1280px maintaining aspect ratio, encode as JPEG, and return base64
fn process_image(rgba: RgbaImage, is_fallback: bool) -> Result<CapturedImage, String> {
    let mut dynamic_img = DynamicImage::ImageRgba8(rgba);

    let (orig_w, orig_h) = (dynamic_img.width(), dynamic_img.height());
    let max_dimension = 1280u32;

    if orig_w > max_dimension || orig_h > max_dimension {
        let (new_w, new_h) = if orig_w >= orig_h {
            let ratio = max_dimension as f32 / orig_w as f32;
            (max_dimension, ((orig_h as f32 * ratio).round() as u32).max(1))
        } else {
            let ratio = max_dimension as f32 / orig_h as f32;
            (((orig_w as f32 * ratio).round() as u32).max(1), max_dimension)
        };

        info!("Downscaling captured image from {}x{} to {}x{}", orig_w, orig_h, new_w, new_h);
        dynamic_img = dynamic_img.resize(new_w, new_h, FilterType::Triangle);
    }

    let final_w = dynamic_img.width();
    let final_h = dynamic_img.height();

    // Convert to RGB for JPEG encoding (discards alpha for smaller payload)
    let rgb_img = dynamic_img.to_rgb8();

    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);

    rgb_img
        .write_to(&mut cursor, ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode JPEG: {}", e))?;

    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    let b64 = STANDARD.encode(&buffer);

    Ok(CapturedImage {
        base64: b64,
        width: final_w,
        height: final_h,
        is_fallback,
    })
}

#[cfg(target_os = "windows")]
fn capture_active_window_windows() -> Result<RgbaImage, String> {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        HDC, HGDIOBJ, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowRect, IsWindowVisible,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == HWND(0 as _) {
            return Err("No active foreground window found".to_string());
        }

        if !IsWindowVisible(hwnd).as_bool() {
            return Err("Foreground window is not visible".to_string());
        }

        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).map_err(|e| format!("GetWindowRect failed: {}", e))?;

        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;

        if width <= 10 || height <= 10 {
            return Err(format!("Foreground window rect too small ({}x{})", width, height));
        }

        capture_gdi_rect(rect.left, rect.top, width, height)
    }
}

#[cfg(target_os = "windows")]
fn capture_fullscreen_windows() -> Result<RgbaImage, String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
    };

    unsafe {
        let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);

        if width <= 0 || height <= 0 {
            return Err("Virtual screen dimensions invalid".to_string());
        }

        capture_gdi_rect(x, y, width, height)
    }
}

#[cfg(target_os = "windows")]
unsafe fn capture_gdi_rect(x: i32, y: i32, width: i32, height: i32) -> Result<RgbaImage, String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        HDC, HGDIOBJ, SRCCOPY,
    };

    // CAPTUREBLT = 0x40000000 ensures transparent/layered windows are included
    const CAPTUREBLT: u32 = 0x40000000;

    let hdc_screen: HDC = GetDC(HWND(0 as _));
    if hdc_screen.is_invalid() {
        return Err("Failed to get screen DC".to_string());
    }

    let hdc_mem: HDC = CreateCompatibleDC(hdc_screen);
    if hdc_mem.is_invalid() {
        ReleaseDC(HWND(0 as _), hdc_screen);
        return Err("Failed to create compatible memory DC".to_string());
    }

    let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
    if hbitmap.is_invalid() {
        DeleteDC(hdc_mem);
        ReleaseDC(HWND(0 as _), hdc_screen);
        return Err("Failed to create compatible bitmap".to_string());
    }

    let old_obj: HGDIOBJ = SelectObject(hdc_mem, hbitmap);

    let blt_res = BitBlt(
        hdc_mem,
        0,
        0,
        width,
        height,
        hdc_screen,
        x,
        y,
        windows::Win32::Graphics::Gdi::ROP_CODE(SRCCOPY.0 | CAPTUREBLT),
    );

    if let Err(e) = blt_res {
        SelectObject(hdc_mem, old_obj);
        DeleteObject(hbitmap);
        DeleteDC(hdc_mem);
        ReleaseDC(HWND(0 as _), hdc_screen);
        return Err(format!("BitBlt failed: {}", e));
    }

    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height, // negative means top-down DIB
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [windows::Win32::Graphics::Gdi::RGBQUAD::default()],
    };

    let buffer_size = (width * height * 4) as usize;
    let mut bgra_buffer: Vec<u8> = vec![0; buffer_size];

    let lines = GetDIBits(
        hdc_mem,
        hbitmap,
        0,
        height as u32,
        Some(bgra_buffer.as_mut_ptr() as *mut _),
        &mut bmi,
        DIB_RGB_COLORS,
    );

    // Cleanup GDI objects
    SelectObject(hdc_mem, old_obj);
    DeleteObject(hbitmap);
    DeleteDC(hdc_mem);
    ReleaseDC(HWND(0 as _), hdc_screen);

    if lines == 0 {
        return Err("GetDIBits failed to read bitmap data".to_string());
    }

    // Convert BGRA to RGBA
    let mut rgba_buffer: Vec<u8> = vec![0; buffer_size];
    for (bgra_chunk, rgba_chunk) in bgra_buffer.chunks_exact(4).zip(rgba_buffer.chunks_exact_mut(4)) {
        rgba_chunk[0] = bgra_chunk[2]; // R
        rgba_chunk[1] = bgra_chunk[1]; // G
        rgba_chunk[2] = bgra_chunk[0]; // B
        rgba_chunk[3] = 255;           // A (opaque)
    }

    RgbaImage::from_raw(width as u32, height as u32, rgba_buffer)
        .ok_or_else(|| "Failed to construct RgbaImage from buffer".to_string())
}
