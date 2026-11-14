# Dial-a-Planet: Pico controller script (runs on a Raspberry Pi Pico 2 W)
# Reads the knob, joystick and 2 Grove buttons and sends simple text lines
# over USB serial to the laptop's web app. The Pico only reports raw input;
# the web app decides what each control does (see docs/controls.md).
#
#   J,<x>,<y>   joystick, each 0-1023     -> moves the cursor over the map
#   K,<value>   knob, 0-1023              -> menu: pick dataset / in dataset: pick year
#   B,1         Button A (GP10) pressed   -> select dataset
#   B,2         Button B (GP14) pressed   -> back to dataset menu
#   B,9         joystick clicked in       -> cycle: area info -> details -> music
#   READY       sent once at startup
#
# The laptop can send back:
#   PING              -> Pico answers PONG (connection check)
#   L,<line1>|<line2> -> shows text on the LCD (ignored if no LCD is connected)

from machine import ADC, Pin, I2C
import sys
import time
import select

# ---------- Pins ----------
joy_x = ADC(26)
joy_y = ADC(27)
knob = ADC(28)
select_btn = Pin(10, Pin.IN)   # Grove button: 1 = pressed. No internal pull (Pico 2 quirk).
back_btn = Pin(14, Pin.IN)

# ---------- Tuning ----------
LOOP_MS = 33          # ~30 updates per second
JOY_CHANGE = 4        # only send J when it moves at least this much (kills jitter)
KNOB_CHANGE = 3       # only send K when it moves at least this much
HEARTBEAT_MS = 500    # resend J and K at least this often so the app never goes stale
CLICK_LEVEL = 1000    # joystick X at or above this = stick pressed in
DEBOUNCE_MS = 30      # ignore button chatter shorter than this


def read(adc, samples=4):
    total = 0
    for _ in range(samples):
        total += adc.read_u16()
    return (total // samples) * 1023 // 65535


def send(msg):
    sys.stdout.write(msg + "\n")


# ---------- Optional LCD (skipped for now; works automatically once plugged in) ----------
lcd_ok = False
LCD = 0x3E
try:
    i2c = I2C(0, sda=Pin(4), scl=Pin(5), freq=100000)
    devices = i2c.scan()
    if LCD in devices:
        def lcd_cmd(c):
            i2c.writeto(LCD, bytes([0x80, c]))

        def lcd_data(d):
            i2c.writeto(LCD, bytes([0x40, d]))

        time.sleep_ms(50)
        for _ in range(3):
            lcd_cmd(0x28)
            time.sleep_ms(5)
        lcd_cmd(0x0C)
        lcd_cmd(0x01)
        time.sleep_ms(2)
        lcd_cmd(0x06)
        if 0x62 in devices:   # RGB backlight v4
            for reg, val in [(0x00, 0x00), (0x01, 0x20), (0x08, 0xFF),
                             (0x04, 255), (0x03, 255), (0x02, 255)]:
                i2c.writeto(0x62, bytes([reg, val]))
        lcd_ok = True
except Exception:
    lcd_ok = False


def lcd_show(line1, line2=""):
    if not lcd_ok:
        return
    try:
        for row, text in enumerate((line1, line2)):
            lcd_cmd(0x80 | (0x40 if row else 0x00))
            for ch in (text + " " * 16)[:16]:
                lcd_data(ord(ch))
    except Exception:
        pass


# ---------- Incoming messages from the laptop ----------
poller = select.poll()
poller.register(sys.stdin, select.POLLIN)
rx = ""


def check_incoming():
    global rx
    while poller.poll(0):
        ch = sys.stdin.read(1)
        if ch in "\r\n":
            line = rx.strip()
            rx = ""
            if line == "PING":
                send("PONG")
            elif line.startswith("L,"):
                parts = line[2:].split("|")
                lcd_show(parts[0], parts[1] if len(parts) > 1 else "")
        else:
            rx += ch
            if len(rx) > 64:   # garbage protection
                rx = ""


# ---------- Main loop ----------
last_x = last_y = last_k = -100
last_heartbeat = time.ticks_ms()
clicked = False
click_reads = 0

buttons = {1: select_btn, 2: back_btn}
btn_state = {1: 0, 2: 0}
btn_changed = {1: 0, 2: 0}

lcd_show("Dial-a-Planet", "Ready")
send("READY")

while True:
    start = time.ticks_ms()
    heartbeat = time.ticks_diff(start, last_heartbeat) >= HEARTBEAT_MS
    if heartbeat:
        last_heartbeat = start

    x = read(joy_x)
    y = read(joy_y)
    k = read(knob, 8)

    # Joystick click: X jumps to 1023 when the stick is pressed in.
    # Require 2 reads in a row so a single noisy spike can't trigger it.
    if x >= CLICK_LEVEL:
        click_reads += 1
        if click_reads == 2 and not clicked:
            clicked = True
            send("B,9")
    else:
        click_reads = 0
        clicked = False
        if heartbeat or abs(x - last_x) >= JOY_CHANGE or abs(y - last_y) >= JOY_CHANGE:
            send("J,%d,%d" % (x, y))
            last_x, last_y = x, y

    # Knob
    if heartbeat or abs(k - last_k) >= KNOB_CHANGE:
        send("K,%d" % k)
        last_k = k

    # Buttons: send once on press, with debounce
    for bid, pin in buttons.items():
        v = pin.value()
        if v != btn_state[bid] and time.ticks_diff(start, btn_changed[bid]) > DEBOUNCE_MS:
            btn_state[bid] = v
            btn_changed[bid] = start
            if v:
                send("B,%d" % bid)

    check_incoming()

    # keep a steady ~30 Hz
    spent = time.ticks_diff(time.ticks_ms(), start)
    if spent < LOOP_MS:
        time.sleep_ms(LOOP_MS - spent)
