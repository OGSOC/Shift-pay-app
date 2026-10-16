// Native-shell integration (Capacitor). A no-op when this page is loaded
// in an ordinary browser (e.g. the GitHub Pages PWA) - `Capacitor` is only
// injected into the WebView of the wrapped Android app.
(function () {
  const Capacitor = window.Capacitor;
  if (!Capacitor || !Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) return;

  const { StatusBar, App } = Capacitor.Plugins;

  StatusBar?.setBackgroundColor?.({ color: '#0b1f3a' }).catch(() => {});
  StatusBar?.setStyle?.({ style: 'DARK' }).catch(() => {});

  // Hardware back button: close an open day editor first, then back out of
  // the Settings tab to Today, and only exit the app from the Today tab -
  // matches how every other Android app's back stack behaves, rather than
  // Capacitor's default of exiting immediately from any screen.
  App?.addListener?.('backButton', () => {
    const modal = document.getElementById('day-modal');
    if (modal && !modal.classList.contains('hidden')) {
      closeDayModal();
      return;
    }
    const settingsView = document.getElementById('view-settings');
    if (settingsView && settingsView.classList.contains('active')) {
      showView('today');
      return;
    }
    App.exitApp();
  });
})();
