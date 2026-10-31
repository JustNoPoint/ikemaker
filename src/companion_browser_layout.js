'use strict';

const MINIMUM_BROWSER_WIDTH = 420;
const MAX_RESIZE_ATTEMPTS = 20;
const WIDTH_TOLERANCE = 18;

function style() {
  return `html,body{max-width:100%;overflow-x:hidden}.ikemaker-companion-browser{max-width:100%;min-width:0;overflow-x:hidden}.ikemaker-companion-browser :where(main,section,article,details,.panel,.browser-content,.content,.pane,.list,.references,.collisions,.tools,.tabs,.actions){min-width:0;max-width:100%}.ikemaker-companion-browser :where(.bar,.tools,.tabs,.actions,.filters,.manage,.file-nav){flex-wrap:wrap;white-space:normal;overflow-x:hidden}.ikemaker-companion-browser :where(.bar,.tools,.tabs,.manage,.file-nav,#actionControls){flex-shrink:0}.ikemaker-companion-browser :where(button,input,select,textarea){max-width:100%}.ikemaker-companion-browser :where(p,li,dd,.status,.muted,.purpose,.mode-help){overflow-wrap:break-word;word-break:normal}.ikemaker-companion-browser :where(.path-token,.code-token,code,pre,[data-exact-token]){overflow-wrap:anywhere}.ikemaker-companion-browser :where(.list,.references,.collisions,.content,.browser-content){overflow-x:hidden}`;
}

function clientScript(minimumWidth = MINIMUM_BROWSER_WIDTH) {
  const width = Math.max(320, Math.min(800, Number(minimumWidth) || MINIMUM_BROWSER_WIDTH));
  return `(()=>{const minimum=${width};let timer=0;const report=()=>vscode.postMessage({type:'companionBrowserViewport',width:Math.max(0,Math.round(document.documentElement.clientWidth||innerWidth||0)),minimum});addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(report,80)});addEventListener('message',event=>{if(event.data?.type==='companionBrowserMeasure')report()});requestAnimationFrame(()=>{report();vscode.postMessage({type:'companionBrowserReady'})})})();`;
}

function createMinimumWidthController(panel, commands, minimumWidth = MINIMUM_BROWSER_WIDTH, options = {}) {
  const minimum = Math.max(320, Math.min(800, Number(minimumWidth) || MINIMUM_BROWSER_WIDTH));
  const storage = options.storage, preferenceKey = String(options.preferenceKey || ''), floatingOnly = options.floatingOnly === true;
  const resizeNative = typeof options.resizeNative === 'function' ? options.resizeNative : null;
  const savedWidth = Number(preferenceKey && storage?.get?.(preferenceKey));
  let target = Number.isFinite(savedWidth) ? Math.max(minimum, Math.min(1600, Math.round(savedWidth))) : minimum;
  let attempts = 0, lastWidth = null, unchanged = 0, pending = false, opening = false, floating = false, settledWidth = null;
  const request = async () => panel?.webview?.postMessage?.({ type: 'companionBrowserMeasure' });
  const reset = () => { attempts = 0; lastWidth = null; unchanged = 0; pending = false; };
  const beginOpening = () => { reset(); const remembered = Number(preferenceKey && storage?.get?.(preferenceKey)); target = Number.isFinite(remembered) ? Math.max(minimum, Math.min(1600, Math.round(remembered))) : minimum; floating = true; opening = true; settledWidth = null; };
  const endFloating = () => { reset(); floating = false; opening = false; settledWidth = null; };
  const remember = async width => { const value = Math.max(minimum, Math.min(1600, Math.round(width))); target = value; if (preferenceKey && storage?.update) try { await storage.update(preferenceKey, value); } catch (_) {} };
  const resize = async command => {
    pending = true; attempts += 1;
    try {
      panel?.reveal?.(panel.viewColumn, false);
      await commands?.executeCommand?.(command);
    } catch (_) {
      attempts = MAX_RESIZE_ATTEMPTS;
    } finally {
      pending = false;
      await request();
    }
  };
  const resizeToward = async width => {
    if (resizeNative) {
      pending = true; attempts += 1;
      try { await resizeNative(target - width); }
      catch (_) { attempts = MAX_RESIZE_ATTEMPTS; }
      finally { pending = false; await request(); }
      return;
    }
    await resize(width > target ? 'workbench.action.decreaseViewWidth' : 'workbench.action.increaseViewWidth');
  };
  const handle = async message => {
    if (!message || message.type !== 'companionBrowserViewport') return false;
    const width = Number(message.width), requestedMinimum = Number(message.minimum);
    if (!Number.isFinite(width) || width < 0 || requestedMinimum !== minimum) return true;
    if (floatingOnly && !floating) return true;
    if (opening) {
      unchanged = lastWidth !== null && Math.abs(width - lastWidth) <= 2 ? unchanged + 1 : 0;
      lastWidth = width;
      if (Math.abs(width - target) <= WIDTH_TOLERANCE || attempts >= MAX_RESIZE_ATTEMPTS || unchanged >= 2) { opening = false; settledWidth = width; reset(); return true; }
      if (pending) return true;
      await resizeToward(width);
      return true;
    }
    if (floating) {
      if (width < minimum && !pending) { target = minimum; opening = true; reset(); await resizeToward(width); return true; }
      if (settledWidth === null) { settledWidth = width; return true; }
      if (Math.abs(width - settledWidth) >= 8) { settledWidth = width; await remember(width); }
      return true;
    }
    if (width >= minimum) { reset(); return true; }
    unchanged = lastWidth !== null && width <= lastWidth + 2 ? unchanged + 1 : 0;
    lastWidth = width;
    if (pending || attempts >= MAX_RESIZE_ATTEMPTS || unchanged >= 2) return true;
    await resize('workbench.action.increaseViewWidth');
    return true;
  };
  return Object.freeze({ minimum, handle, request, reset, beginOpening, endFloating, target: () => target });
}

module.exports = { MINIMUM_BROWSER_WIDTH, MAX_RESIZE_ATTEMPTS, WIDTH_TOLERANCE, style, clientScript, createMinimumWidthController };
