using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCvssVectorFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AttackVector",
                table: "Vulnerabilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PrivilegesRequired",
                table: "Vulnerabilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UserInteraction",
                table: "Vulnerabilities",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AttackVector",
                table: "Vulnerabilities");

            migrationBuilder.DropColumn(
                name: "PrivilegesRequired",
                table: "Vulnerabilities");

            migrationBuilder.DropColumn(
                name: "UserInteraction",
                table: "Vulnerabilities");
        }
    }
}
