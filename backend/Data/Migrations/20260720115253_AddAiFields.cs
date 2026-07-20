using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAiFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AiSuggestedMitigation",
                table: "Vulnerabilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "AiRelevanceScore",
                table: "AssetVulnerabilities",
                type: "double precision",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AiSuggestedMitigation",
                table: "Vulnerabilities");

            migrationBuilder.DropColumn(
                name: "AiRelevanceScore",
                table: "AssetVulnerabilities");
        }
    }
}
