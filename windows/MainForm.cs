using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace RegatulCartilor
{
    /// <summary>Fereastra programului: aplicația web de pe GitHub Pages într-un WebView2.
    /// Pagina are service worker, deci merge și fără internet după prima deschidere, iar datele (biblioteca)
    /// stau în %LOCALAPPDATA%\Regatul Cartilor\WebView2.</summary>
    class MainForm : Form
    {
        readonly WebView2 web = new WebView2 { Dock = DockStyle.Fill };
        readonly bool actualizat;
        static readonly string Gazda = new Uri(Program.Adresa).Host;

        public MainForm(bool actualizat)
        {
            this.actualizat = actualizat;
            Text = "Regatul Cărților";
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            StartPosition = FormStartPosition.CenterScreen;
            var ecran = Screen.PrimaryScreen.WorkingArea;
            Size = new Size(Math.Min(1100, ecran.Width), Math.Min(850, ecran.Height));
            KeyPreview = true;
            Controls.Add(web);
            Shown += async (s, e) => await Porneste();
            Activated += (s, e) => { if (web.CoreWebView2 != null) web.Focus(); };
        }

        async Task Porneste()
        {
            try
            {
                var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.Date, "WebView2"));
                await web.EnsureCoreWebView2Async(env);
            }
            catch (WebView2RuntimeNotFoundException)
            {
                if (MessageBox.Show(this, Texte.FaraWebView, Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
                    Deschide("https://go.microsoft.com/fwlink/p/?LinkId=2124703");
                Close();
                return;
            }
            var w = web.CoreWebView2;
            w.Settings.IsStatusBarEnabled = false;
            w.Settings.IsZoomControlEnabled = true;
            w.Settings.AreDevToolsEnabled = false;
            // linkurile spre alte site-uri se deschid în browserul obișnuit
            w.NewWindowRequested += (s, e) => { e.Handled = true; Deschide(e.Uri); };
            w.NavigationStarting += (s, e) =>
            {
                if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var u) && (u.Scheme == "http" || u.Scheme == "https") && u.Host != Gazda)
                { e.Cancel = true; Deschide(e.Uri); }
            };
            w.NavigationCompleted += async (s, e) =>
            {
                web.Focus();
                await SalveazaLimba();
            };
            web.Source = new Uri(Program.Adresa);

            if (actualizat) { await Task.Delay(1500); Voce.Spune(Texte.Terminat); }
            else await Actualizare.Verifica(this);
        }

        /// <summary>Limba aleasă în aplicație (S.settings.lang din localStorage) ajunge în limba.txt,
        /// ca programul și installerul să vorbească în aceeași limbă.</summary>
        async Task SalveazaLimba()
        {
            try
            {
                var r = await web.CoreWebView2.ExecuteScriptAsync("(function(){try{return (JSON.parse(localStorage.getItem('raftul-meu-v2')||'{}').settings||{}).lang||''}catch(e){return ''}})()");
                Texte.Limba = (r ?? "").Trim('"');
            }
            catch { }
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == Keys.F5 && web.CoreWebView2 != null) { web.CoreWebView2.Reload(); return true; }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            _ = SalveazaLimba();
            base.OnFormClosing(e);
        }

        static void Deschide(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
        }
    }
}
