using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace RegatulCartilor
{
    /// <summary>Actualizarea programului de Windows. Pagina însăși (cărțile, meniurile, tot ce e în aplicație)
    /// se actualizează singură de pe GitHub Pages, ca pe iPhone. Aici se schimbă doar fereastra din jur, rar:
    /// la pornire se citește version.txt din release-ul „windows”; dacă e mai nou, se descarcă installerul
    /// (NVDA spune „Se actualizează” și procentul din 10 în 10, 0–50), se pornește fără ferestre și programul
    /// se închide; installerul continuă 50–99 și îl redeschide cu --actualizat („100 la sută. Actualizare terminată.”).</summary>
    static class Actualizare
    {
        public static async Task Verifica(Form fereastra)
        {
            Version noua;
            try
            {
                using (var h = new HttpClient { Timeout = TimeSpan.FromSeconds(15) })
                {
                    h.DefaultRequestHeaders.UserAgent.ParseAdd("RegatulCartilor/" + Program.Versiune);
                    var t = (await h.GetStringAsync(Program.Release + "version.txt?" + DateTime.UtcNow.Ticks)).Trim();
                    if (!Version.TryParse(t, out noua) || noua <= Program.Versiune) return;
                }
            }
            catch { return; }   // fără internet: programul merge mai departe cu versiunea instalată

            var f = new Form
            {
                Text = Texte.SeActualizeaza.TrimEnd('.'), FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent,
                ClientSize = new Size(380, 90), MinimizeBox = false, MaximizeBox = false, ShowInTaskbar = false
            };
            var eticheta = new Label { Text = Texte.SeActualizeaza, Location = new Point(14, 12), AutoSize = true };
            var bara = new ProgressBar { Location = new Point(14, 44), Size = new Size(350, 22), Maximum = 100, AccessibleName = Texte.SeActualizeaza.TrimEnd('.') };
            f.Controls.Add(eticheta); f.Controls.Add(bara);
            f.Show(fereastra);
            Voce.Spune(Texte.SeActualizeaza);
            var setup = Path.Combine(Path.GetTempPath(), "RegatulCartilor-Setup.exe");
            int spus = 0;
            try
            {
                using (var h = new HttpClient { Timeout = TimeSpan.FromMinutes(10) })
                using (var r = await h.GetAsync(Program.Release + "RegatulCartilor-Setup.exe", HttpCompletionOption.ResponseHeadersRead))
                {
                    r.EnsureSuccessStatusCode();
                    long total = r.Content.Headers.ContentLength ?? 0, citit = 0;
                    using (var din = await r.Content.ReadAsStreamAsync())
                    using (var spre = File.Create(setup))
                    {
                        var buf = new byte[65536]; int n;
                        while ((n = await din.ReadAsync(buf, 0, buf.Length)) > 0)
                        {
                            await spre.WriteAsync(buf, 0, n); citit += n;
                            if (total <= 0) continue;
                            int p = (int)(citit * 50 / total);   // descărcarea e prima jumătate
                            bara.Value = Math.Min(100, p);
                            int zece = p / 10 * 10;
                            if (zece > spus && zece > 0) { spus = zece; Voce.Spune(Texte.Procent(zece)); }
                        }
                    }
                }
                Process.Start(new ProcessStartInfo(setup, "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /AUTOUPDATE") { UseShellExecute = true });
                Application.Exit();
            }
            catch
            {
                f.Close();
                Voce.Spune(Texte.Esuat);
                try { File.Delete(setup); } catch { }
            }
        }
    }
}
