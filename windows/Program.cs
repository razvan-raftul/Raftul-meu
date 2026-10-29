using System;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace RegatulCartilor
{
    static class Program
    {
        public const string Adresa = "https://razvan-raftul.github.io/Raftul-meu/";
        public const string Release = "https://github.com/razvan-raftul/Raftul-meu/releases/download/windows/";
        public static readonly string Date = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Regatul Cartilor");
        public static Version Versiune => Assembly.GetExecutingAssembly().GetName().Version;
        static Mutex ruleaza;

        [STAThread]
        static int Main(string[] args)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            Directory.CreateDirectory(Date);
            if (Array.IndexOf(args, "--autotest") >= 0) return AutoTest.Ruleaza(args);
            // semnul ăsta îl așteaptă installerul la actualizare, până se închide programul
            ruleaza = new Mutex(false, "RegatulCartilorRuleaza");
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm(Array.IndexOf(args, "--actualizat") >= 0));
            GC.KeepAlive(ruleaza);
            return 0;
        }
    }

    /// <summary>Limba aplicației (aceeași ca în pagină, salvată în limba.txt) și textele programului.</summary>
    static class Texte
    {
        static string FisLimba => Path.Combine(Program.Date, "limba.txt");
        public static string Limba
        {
            get
            {
                try { var l = File.ReadAllText(FisLimba).Trim(); if (l.Length == 2) return l; } catch { }
                var c = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
                return Array.IndexOf(new[] { "ro", "es", "fr", "de", "it", "pt" }, c) >= 0 ? c : "en";
            }
            set { try { if (!string.IsNullOrEmpty(value) && value.Length == 2) File.WriteAllText(FisLimba, value); } catch { } }
        }
        static string T(string en, string ro, string es, string fr, string de, string it, string pt)
        {
            switch (Limba) { case "ro": return ro; case "es": return es; case "fr": return fr; case "de": return de; case "it": return it; case "pt": return pt; default: return en; }
        }
        public static string SeActualizeaza => T("Updating.", "Se actualizează.", "Actualizando.", "Mise à jour.", "Wird aktualisiert.", "Aggiornamento in corso.", "A atualizar.");
        public static string Procent(int p) => string.Format(T("{0} percent.", "{0} la sută.", "{0} por ciento.", "{0} pour cent.", "{0} Prozent.", "{0} per cento.", "{0} por cento."), p);
        public static string Terminat => T("100 percent. Update complete.", "100 la sută. Actualizare terminată.", "100 por ciento. Actualización terminada.", "100 pour cent. Mise à jour terminée.", "100 Prozent. Aktualisierung abgeschlossen.", "100 per cento. Aggiornamento completato.", "100 por cento. Atualização concluída.");
        public static string Esuat => T("The update failed.", "Actualizarea nu a reușit.", "La actualización no se ha completado.", "La mise à jour a échoué.", "Die Aktualisierung ist fehlgeschlagen.", "L'aggiornamento non è riuscito.", "A atualização falhou.");
        public static string FaraWebView => T(
            "Regatul Cărților needs Microsoft Edge WebView2, which is missing on this computer. Open the download page now?",
            "Regatul Cărților are nevoie de Microsoft Edge WebView2, care lipsește de pe acest calculator. Deschid acum pagina de descărcare?",
            "Regatul Cărților necesita Microsoft Edge WebView2, que falta en este ordenador. ¿Abrir ahora la página de descarga?",
            "Regatul Cărților a besoin de Microsoft Edge WebView2, absent de cet ordinateur. Ouvrir la page de téléchargement ?",
            "Regatul Cărților benötigt Microsoft Edge WebView2, das auf diesem Computer fehlt. Downloadseite jetzt öffnen?",
            "Regatul Cărților ha bisogno di Microsoft Edge WebView2, che manca su questo computer. Aprire la pagina di download?",
            "O Regatul Cărților precisa do Microsoft Edge WebView2, que falta neste computador. Abrir a página de transferência?");
    }

    /// <summary>Vorbește prin NVDA (nvdaControllerClient.dll lângă exe). Dacă NVDA nu merge, tace.</summary>
    static class Voce
    {
        [DllImport("nvdaControllerClient.dll", CharSet = CharSet.Unicode)] static extern int nvdaController_speakText(string text);
        [DllImport("nvdaControllerClient.dll")] static extern int nvdaController_testIfRunning();
        public static bool Spune(string text)
        {
            try { if (nvdaController_testIfRunning() == 0) return nvdaController_speakText(text) == 0; } catch { }
            return false;
        }
        public static bool AreDll => File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "nvdaControllerClient.dll"));
    }

    /// <summary>Proba din GitHub Actions: textele, DLL-ul NVDA și pornirea WebView2.</summary>
    static class AutoTest
    {
        public static int Ruleaza(string[] args)
        {
            var o = new System.Text.StringBuilder();
            o.AppendLine("VERSIUNE " + Program.Versiune);
            o.AppendLine("VOCE dll=" + Voce.AreDll);
            o.AppendLine("TEXT " + Texte.SeActualizeaza + " " + Texte.Procent(50));
            try
            {
                var v = Microsoft.Web.WebView2.Core.CoreWebView2Environment.GetAvailableBrowserVersionString();
                o.AppendLine("WEBVIEW2 " + v);
            }
            catch (Exception e) { o.AppendLine("WEBVIEW2 lipsa: " + e.GetType().Name); }
            o.AppendLine("AUTOTEST OK");
            File.WriteAllText(args.Length > 1 ? args[Array.IndexOf(args, "--autotest") + 1] : "autotest.txt", o.ToString());
            return 0;
        }
    }
}
